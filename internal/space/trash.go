package space

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/removal"
)

// SkipReason is why MoveToTrash left a picked Space item in place.
type SkipReason = removal.SkipReason

// TrashedItem is what MoveToTrash did with one picked Space item: moved, or
// skipped with SkipReason. Name and Path are empty only for an id no current
// result lists.
type TrashedItem struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Path       string      `json:"path"`
	Bytes      int64       `json:"bytes"`
	SkipReason *SkipReason `json:"skipReason"`
}

// TrashReport is the outcome of one Move to Trash, item by item. MovedBytes
// counts the measured sizes of the items moved: their space is freed only
// once the Trash is emptied.
type TrashReport struct {
	Items      []TrashedItem `json:"items"`
	MovedBytes int64         `json:"movedBytes"`
}

// TrashProgress is an observable point in a running Move to Trash.
type TrashProgress struct {
	Total      int   `json:"total"`
	Processed  int   `json:"processed"`
	MovedBytes int64 `json:"movedBytes"`
}

// MoveToTrash moves the picked Space items into the Trash, and never deletes
// (ADR 0004). It takes ids a current result lists, never paths. Every item is
// re-checked right before it moves; one that fails a check or cannot be moved
// is skipped with its reason, never retried, and the run goes on.
func (e *Engine) MoveToTrash(ctx context.Context, ids []string, onProgress func(TrashProgress) error) (TrashReport, error) {
	guard, err := removal.NewPickedGuard(e.home, belowFirstLevel, outsideCleansGround)
	if err != nil {
		return TrashReport{}, err
	}
	unknown, items := e.plan(ids)
	started := time.Now()
	report, err := e.trash(ctx, guard, unknown, items, onProgress)
	e.forget(report)
	// A stopped run is logged too: it may have moved items already.
	if historyErr := removal.AppendHistory(e.home, started, historyItems(report)); historyErr != nil {
		e.logger.Error("could not log Move to Trash history", "error", historyErr)
	}
	return report, err
}

// belowFirstLevel is Space's rule against Home's own files and folders: one
// click must not remove a whole personal folder.
func belowFirstLevel(rel string) bool {
	return strings.Contains(rel, "/")
}

// outsideCleansGround is Space's rule against what Clean removes: each kind
// of junk has one place to remove it.
func outsideCleansGround(rel string) bool {
	return !clean.InGround(rel)
}

// plan splits ids, each taken once, into the ones no current result lists and
// the Space items of the rest, by path. A folder so comes before what lies in
// it, which then is already gone: its bytes count once.
func (e *Engine) plan(ids []string) (unknown []string, items []SpaceItem) {
	unique := slices.Clone(ids)
	slices.Sort(unique)
	for _, id := range slices.Compact(unique) {
		item, ok := e.measuredItem(id)
		if !ok {
			unknown = append(unknown, id)
			continue
		}
		items = append(items, item)
	}
	slices.SortFunc(items, func(a, b SpaceItem) int { return cmp.Compare(a.Path, b.Path) })
	return unknown, items
}

// trash skips the unknown ids, then moves each item in turn into report,
// sending progress before the first item and after each one. A stopped run
// returns what it did so far.
func (e *Engine) trash(ctx context.Context, guard *removal.Guard, unknown []string, items []SpaceItem, onProgress func(TrashProgress) error) (TrashReport, error) {
	report := TrashReport{Items: make([]TrashedItem, 0, len(unknown)+len(items))}
	for _, id := range unknown {
		report.Items = append(report.Items, TrashedItem{ID: id, SkipReason: ptr(removal.Protected)})
	}
	total := len(unknown) + len(items)
	send := func() error {
		if onProgress == nil {
			return nil
		}
		return onProgress(TrashProgress{Total: total, Processed: len(report.Items), MovedBytes: report.MovedBytes})
	}
	if err := send(); err != nil {
		return report, err
	}
	for _, item := range items {
		if err := ctx.Err(); err != nil {
			return report, fmt.Errorf("space: moving to Trash: %w", err)
		}
		trashed := e.moveItem(guard, item)
		report.Items = append(report.Items, trashed)
		if trashed.SkipReason == nil {
			report.MovedBytes += item.Bytes
		}
		if err := send(); err != nil {
			return report, err
		}
	}
	return report, nil
}

func (e *Engine) moveItem(guard *removal.Guard, item SpaceItem) TrashedItem {
	trashed := TrashedItem{ID: item.ID, Name: item.Name, Path: item.Path, Bytes: item.Bytes}
	if reason, ok := guard.Check(item.Path); !ok {
		trashed.SkipReason = ptr(reason)
		return trashed
	}
	if err := e.remover.MoveToTrash(item.Path); err != nil {
		e.logger.Warn("could not move Space item to Trash", "path", item.Path, "error", err)
		trashed.SkipReason = ptr(removal.FailureReason(err))
	}
	return trashed
}

// forget takes what report says left the disk out of every listing: the
// items, what lay in them, and their bytes from the folders that held them,
// so a later run counts what those folders still hold. An item already gone
// left too, unless a folder of the same run took it.
func (e *Engine) forget(report TrashReport) {
	var gone []TrashedItem
	for _, item := range report.Items {
		if item.SkipReason == nil || *item.SkipReason == removal.AlreadyGone {
			gone = append(gone, item)
		}
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, item := range gone {
		if slices.ContainsFunc(gone, func(other TrashedItem) bool { return inside(other.Path, item.Path) }) {
			continue
		}
		for _, listed := range e.current {
			for id, held := range listed.items {
				switch {
				case held.Path == item.Path || inside(item.Path, held.Path):
					delete(listed.items, id)
				case inside(held.Path, item.Path):
					held.Bytes = max(0, held.Bytes-item.Bytes)
					listed.items[id] = held
				}
			}
		}
	}
}

// inside reports whether path lies strictly below folder.
func inside(folder, path string) bool {
	return strings.HasPrefix(path, folder+"/")
}

// historyItems is report as the history file logs it.
func historyItems(report TrashReport) []removal.HistoryItem {
	items := make([]removal.HistoryItem, 0, len(report.Items))
	for _, item := range report.Items {
		logged := removal.HistoryItem{ID: item.ID, Path: item.Path, Bytes: item.Bytes, Method: removal.MoveToTrash, Outcome: removal.Removed}
		if item.SkipReason != nil {
			logged.Outcome = removal.Skipped
			logged.Reason = *item.SkipReason
		}
		items = append(items, logged)
	}
	return items
}
