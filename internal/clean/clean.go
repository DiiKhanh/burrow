package clean

import (
	"context"
	"time"

	"github.com/DiiKhanh/burrow/internal/removal"
)

// SkipReason is why Clean left a selected junk item in place.
type SkipReason = removal.SkipReason

const (
	InUse            = removal.InUse
	PermissionDenied = removal.PermissionDenied
	Protected        = removal.Protected
	AlreadyGone      = removal.AlreadyGone
)

// CleanedItem is what Clean did with one selected junk item: removed with
// Method, or skipped with SkipReason. Path and Method are empty only for an
// id the current ScanResult does not hold.
type CleanedItem struct {
	ID         string         `json:"id"`
	Path       string         `json:"path"`
	Bytes      int64          `json:"bytes"`
	Method     *RemovalMethod `json:"method"`
	SkipReason *SkipReason    `json:"skipReason"`
}

// CleanReport is the outcome of one Clean, item by item.
type CleanReport struct {
	Items []CleanedItem `json:"items"`
	// FreedBytes counts the Scan sizes of the deleted items.
	FreedBytes int64 `json:"freedBytes"`
	// TrashedBytes counts the Scan sizes of the items moved to Trash: their
	// space is freed only once the Trash is emptied.
	TrashedBytes int64 `json:"trashedBytes"`
}

// CleanProgress is an observable point in a running Clean: how far the
// active junk group got, and the bytes freed and moved to Trash by the whole
// run so far.
type CleanProgress struct {
	GroupID      JunkGroupID `json:"groupId"`
	Selected     int         `json:"selected"`
	Cleaned      int         `json:"cleaned"`
	Skipped      int         `json:"skipped"`
	FreedBytes   int64       `json:"freedBytes"`
	TrashedBytes int64       `json:"trashedBytes"`
}

// Clean removes the selected junk items of the current ScanResult. The
// selection holds item ids, never paths. Every item is re-checked right
// before removal; one that fails a check or cannot be removed is skipped with
// its reason, never retried, and the run goes on.
func (e *Engine) Clean(ctx context.Context, selection []string, onProgress func(CleanProgress) error) (CleanReport, error) {
	if !e.busy.TryLock() {
		return CleanReport{}, ErrBusy
	}
	defer e.busy.Unlock()
	guard, err := removal.NewGuard(e.home)
	if err != nil {
		return CleanReport{}, err
	}
	unknown, groups := e.plan(selection)
	started := time.Now()
	report, err := e.run(ctx, guard, unknown, groups, onProgress)
	// A stopped run is logged too: it may have removed items already.
	if historyErr := removal.AppendHistory(e.home, started, historyItems(report)); historyErr != nil {
		e.logger.Error("could not log Clean history", "error", historyErr)
	}
	return report, err
}

// run skips the unknown ids, then cleans each group in turn.
func (e *Engine) run(ctx context.Context, guard *removal.Guard, unknown []string, groups []JunkGroup, onProgress func(CleanProgress) error) (CleanReport, error) {
	report := CleanReport{Items: make([]CleanedItem, 0, len(unknown))}
	for _, id := range unknown {
		report.Items = append(report.Items, CleanedItem{ID: id, SkipReason: ptr(Protected)})
	}
	for _, group := range groups {
		if err := e.cleanGroup(ctx, guard, group, &report, onProgress); err != nil {
			return report, err
		}
	}
	return report, nil
}

// cleanGroup removes the selected items of one group into report, sending
// progress before the first item and after each one.
func (e *Engine) cleanGroup(ctx context.Context, guard *removal.Guard, group JunkGroup, report *CleanReport, onProgress func(CleanProgress) error) error {
	progress := CleanProgress{GroupID: group.ID, Selected: len(group.Items), FreedBytes: report.FreedBytes, TrashedBytes: report.TrashedBytes}
	if err := sendCleanProgress(onProgress, progress); err != nil {
		return err
	}
	for _, item := range group.Items {
		if err := ctx.Err(); err != nil {
			return err
		}
		cleaned := e.remove(guard, group, item)
		report.Items = append(report.Items, cleaned)
		switch {
		case cleaned.SkipReason != nil:
			progress.Skipped++
		case group.RemovalMethod == MoveToTrash:
			report.TrashedBytes += item.Bytes
			progress.Cleaned++
		default:
			report.FreedBytes += item.Bytes
			progress.Cleaned++
		}
		progress.FreedBytes = report.FreedBytes
		progress.TrashedBytes = report.TrashedBytes
		if err := sendCleanProgress(onProgress, progress); err != nil {
			return err
		}
	}
	return nil
}

func sendCleanProgress(send func(CleanProgress) error, progress CleanProgress) error {
	if send == nil {
		return nil
	}
	return send(progress)
}

// plan splits selection into ids the current ScanResult does not hold and
// the selected items of each group, in ScanResult order.
func (e *Engine) plan(selection []string) (unknown []string, groups []JunkGroup) {
	selected := make(map[string]bool, len(selection))
	for _, id := range selection {
		selected[id] = true
	}
	for _, group := range e.current.Groups {
		var items []JunkItem
		for _, item := range group.Items {
			if selected[item.ID] {
				items = append(items, item)
				delete(selected, item.ID)
			}
		}
		if len(items) > 0 {
			groups = append(groups, JunkGroup{ID: group.ID, RemovalMethod: group.RemovalMethod, Items: items})
		}
	}
	for _, id := range selection {
		if selected[id] {
			unknown = append(unknown, id)
			delete(selected, id)
		}
	}
	return unknown, groups
}

// remove checks item of group and removes it with the group's method. An
// item of a group locked right now is in use.
func (e *Engine) remove(guard *removal.Guard, group JunkGroup, item JunkItem) CleanedItem {
	cleaned := CleanedItem{ID: item.ID, Path: item.Path, Bytes: item.Bytes, Method: ptr(group.RemovalMethod)}
	if e.isLocked(group.ID) {
		cleaned.SkipReason = ptr(InUse)
		return cleaned
	}
	if reason, ok := guard.Check(item.Path); !ok {
		cleaned.SkipReason = ptr(reason)
		return cleaned
	}
	removeWith := e.remover.Delete
	if group.RemovalMethod == MoveToTrash {
		removeWith = e.remover.MoveToTrash
	}
	if err := removeWith(item.Path); err != nil {
		e.logger.Warn("could not remove junk item", "path", item.Path, "error", err)
		cleaned.SkipReason = ptr(removal.FailureReason(err))
	}
	return cleaned
}

// historyItems is report as the history file logs it.
func historyItems(report CleanReport) []removal.HistoryItem {
	items := make([]removal.HistoryItem, 0, len(report.Items))
	for _, item := range report.Items {
		logged := removal.HistoryItem{ID: item.ID, Path: item.Path, Bytes: item.Bytes, Outcome: removal.Removed}
		if item.Method != nil {
			logged.Method = *item.Method
		}
		if item.SkipReason != nil {
			logged.Outcome = removal.Skipped
			logged.Reason = *item.SkipReason
		}
		items = append(items, logged)
	}
	return items
}

func ptr[T any](v T) *T { return &v }
