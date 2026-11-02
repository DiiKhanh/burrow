package space

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/DiiKhanh/burrow/internal/removal"
	"github.com/DiiKhanh/burrow/internal/removal/removaltest"
)

// trashHome is a fake Home on disk, with the engine and remover under test.
type trashHome struct {
	path     string
	remover  *removaltest.FakeRemover
	measurer *fakeMeasurer
	engine   *Engine
}

func newTrashHome(t *testing.T) *trashHome {
	t.Helper()
	path, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	remover := &removaltest.FakeRemover{TrashDir: filepath.Join(path, "fake-trash")}
	measurer := &fakeMeasurer{}
	return &trashHome{
		path:     path,
		remover:  remover,
		measurer: measurer,
		engine:   NewEngine(Options{Measurer: measurer, Home: path, Remover: remover}),
	}
}

func (h *trashHome) write(t *testing.T, rel string, bytes int) string {
	t.Helper()
	path := filepath.Join(h.path, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, make([]byte, bytes), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// measure has a Measure list paths, each with its size on disk, and returns
// their ids in the order given.
func (h *trashHome) measure(t *testing.T, paths ...string) []string {
	t.Helper()
	items := make([]MeasuredItem, 0, len(paths))
	ids := make([]string, 0, len(paths))
	for _, path := range paths {
		items = append(items, MeasuredItem{Name: filepath.Base(path), Path: path, Bytes: sizeOn(path), ReadState: ReadComplete})
		ids = append(ids, itemID(path))
	}
	h.measurer.measurement = Measurement{Items: items}
	if _, err := h.engine.Measure(context.Background(), MeasureTarget{Kind: Overview}); err != nil {
		t.Fatal(err)
	}
	return ids
}

func sizeOn(path string) int64 {
	info, err := os.Lstat(path)
	if err != nil || info.IsDir() {
		return 0
	}
	return info.Size()
}

func assertExists(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Lstat(path); err != nil {
		t.Errorf("%s should still exist: %v", path, err)
	}
}

func assertGone(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Lstat(path); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("%s should be gone, Lstat = %v", path, err)
	}
}

func TestMoveToTrashMovesEachPickedItemAndNeverDeletes(t *testing.T) {
	h := newTrashHome(t)
	first := h.write(t, "Projects/old/data.bin", 30)
	second := h.write(t, "Downloads/Xcode.xip", 12)
	ids := h.measure(t, first, second)

	report, err := h.engine.MoveToTrash(context.Background(), ids, nil)
	if err != nil {
		t.Fatal(err)
	}

	assertGone(t, first)
	assertGone(t, second)
	if len(h.remover.Deleted()) != 0 {
		t.Errorf("deleted %v, want nothing", h.remover.Deleted())
	}
	if len(h.remover.Trashed()) != 2 {
		t.Errorf("trashed %v, want both", h.remover.Trashed())
	}
	if report.MovedBytes != 42 {
		t.Errorf("movedBytes = %d, want 42", report.MovedBytes)
	}
	for _, item := range report.Items {
		if item.SkipReason != nil {
			t.Errorf("%s skipped as %s, want moved", item.Path, *item.SkipReason)
		}
	}
}

func skipReason(t *testing.T, report TrashReport, id string) removal.SkipReason {
	t.Helper()
	index := slices.IndexFunc(report.Items, func(item TrashedItem) bool { return item.ID == id })
	if index < 0 {
		t.Fatalf("report %+v does not hold %s", report, id)
	}
	if report.Items[index].SkipReason == nil {
		return ""
	}
	return *report.Items[index].SkipReason
}

// Each case is a Space item a Measure listed. The UI offers no checkbox for
// most of them, so these are the checks that hold when it is wrong or stale.
func TestMoveToTrashSkipsWhatTheGuardRefuses(t *testing.T) {
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name  string
		setup func(t *testing.T, h *trashHome) string
	}{
		{"above Home by dot-dot", func(_ *testing.T, h *trashHome) string { return h.path + "/Projects/../../other" }},
		{"dot-dot back into Home", func(t *testing.T, h *trashHome) string {
			h.write(t, "Projects/app/file", 1)
			return h.path + "/Projects/../Projects/app/file"
		}},
		{"control character", func(t *testing.T, h *trashHome) string { return h.write(t, "Projects/bad\nname", 1) }},
		{"outside Home", func(*testing.T, *trashHome) string { return filepath.Join(outside, "secret") }},
		{"Home itself", func(_ *testing.T, h *trashHome) string { return h.path }},
		{"first-level folder", func(t *testing.T, h *trashHome) string { return filepath.Dir(h.write(t, "Projects/file", 1)) }},
		{"first-level personal folder", func(t *testing.T, h *trashHome) string { return filepath.Dir(h.write(t, "Documents/file", 1)) }},
		{"first-level file", func(t *testing.T, h *trashHome) string { return h.write(t, "notes.txt", 1) }},
		{"Clean's ground", func(t *testing.T, h *trashHome) string { return h.write(t, "Library/Caches/Homebrew/blob", 1) }},
		{"Clean's ground in another case", func(t *testing.T, h *trashHome) string {
			h.write(t, "Library/Logs/app.log", 1)
			return filepath.Join(h.path, "library/logs/app.log")
		}},
		{"the Trash", func(t *testing.T, h *trashHome) string { return h.write(t, ".Trash/old.zip", 1) }},
		{"on the protected list", func(t *testing.T, h *trashHome) string { return h.write(t, ".ssh/id_ed25519", 1) }},
		{"Burrow's own data", func(t *testing.T, h *trashHome) string {
			return h.write(t, "Library/Application Support/Burrow/history.jsonl", 1)
		}},
		{"symlinked parent leaving Home", func(t *testing.T, h *trashHome) string {
			h.write(t, "Projects/keep", 1)
			link := filepath.Join(h.path, "Projects/link")
			if err := os.Symlink(outside, link); err != nil {
				t.Fatal(err)
			}
			return filepath.Join(link, "secret")
		}},
		{"symlink onto the protected list", func(t *testing.T, h *trashHome) string {
			key := h.write(t, ".ssh/id_ed25519", 1)
			link := filepath.Join(filepath.Dir(h.write(t, "Downloads/keep", 1)), "key")
			if err := os.Symlink(key, link); err != nil {
				t.Fatal(err)
			}
			return link
		}},
		{"symlinked parent into Clean's ground", func(t *testing.T, h *trashHome) string {
			caches := filepath.Dir(h.write(t, "Library/Caches/blob", 1))
			link := filepath.Join(filepath.Dir(h.write(t, "Projects/keep", 1)), "caches")
			if err := os.Symlink(caches, link); err != nil {
				t.Fatal(err)
			}
			return filepath.Join(link, "blob")
		}},
		{"symlink onto a first-level folder", func(t *testing.T, h *trashHome) string {
			documents := filepath.Dir(h.write(t, "Documents/file", 1))
			link := filepath.Join(filepath.Dir(h.write(t, "Projects/keep", 1)), "documents")
			if err := os.Symlink(documents, link); err != nil {
				t.Fatal(err)
			}
			return link
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			h := newTrashHome(t)
			valid := h.write(t, "Projects/valid/data", 10)
			path := test.setup(t, h)
			ids := h.measure(t, path, valid)

			report, err := h.engine.MoveToTrash(context.Background(), ids, nil)
			if err != nil {
				t.Fatal(err)
			}

			if got := skipReason(t, report, ids[0]); got != removal.Protected {
				t.Errorf("skip reason = %q, want protected", got)
			}
			if slices.Contains(h.remover.Trashed(), path) {
				t.Errorf("%s reached the Remover", path)
			}
			// One skipped item never stops the run.
			assertGone(t, valid)
			if report.MovedBytes != 10 {
				t.Errorf("movedBytes = %d, want only the valid item's 10", report.MovedBytes)
			}
		})
	}
}

// ADR 0004: the id comes from a Measure, never the UI's word for a path.
func TestMoveToTrashSkipsAnIDNoMeasureListed(t *testing.T) {
	h := newTrashHome(t)
	target := h.write(t, "Projects/old/data", 5)
	h.measure(t)

	forged := itemID(target)
	report, err := h.engine.MoveToTrash(context.Background(), []string{forged}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if got := skipReason(t, report, forged); got != removal.Protected {
		t.Errorf("skip reason = %q, want protected", got)
	}
	assertExists(t, target)
	if len(h.remover.Trashed()) != 0 {
		t.Errorf("trashed %v, want nothing", h.remover.Trashed())
	}
}

func TestMoveToTrashSkipsAnItemGoneSinceItsMeasure(t *testing.T) {
	h := newTrashHome(t)
	target := h.write(t, "Projects/old/data", 5)
	ids := h.measure(t, target)
	if err := os.Remove(target); err != nil {
		t.Fatal(err)
	}

	report, err := h.engine.MoveToTrash(context.Background(), ids, nil)
	if err != nil {
		t.Fatal(err)
	}

	if got := skipReason(t, report, ids[0]); got != removal.AlreadyGone {
		t.Errorf("skip reason = %q, want already_gone", got)
	}
	if report.MovedBytes != 0 {
		t.Errorf("movedBytes = %d, want 0", report.MovedBytes)
	}
}

func TestMoveToTrashSkipsWhatTheSystemRefuses(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want removal.SkipReason
	}{
		{"no permission", fs.ErrPermission, removal.PermissionDenied},
		{"any other refusal", errors.New("Finder said no"), removal.PermissionDenied},
		{"gone meanwhile", fs.ErrNotExist, removal.AlreadyGone},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			h := newTrashHome(t)
			refused := h.write(t, "Projects/old/data", 5)
			valid := h.write(t, "Projects/other/data", 7)
			h.remover.Fail = func(path string) error {
				if path == refused {
					return test.err
				}
				return nil
			}
			ids := h.measure(t, refused, valid)

			report, err := h.engine.MoveToTrash(context.Background(), ids, nil)
			if err != nil {
				t.Fatal(err)
			}

			if got := skipReason(t, report, ids[0]); got != test.want {
				t.Errorf("skip reason = %q, want %q", got, test.want)
			}
			if got := len(h.remover.Trashed()); got != 2 {
				t.Errorf("Remover tried %d times, want each item once: no retries", got)
			}
			assertGone(t, valid)
			if report.MovedBytes != 7 {
				t.Errorf("movedBytes = %d, want 7", report.MovedBytes)
			}
		})
	}
}

// A real unreadable parent stops the check before any move.
func TestMoveToTrashSkipsAnItemBehindAFolderItCannotEnter(t *testing.T) {
	h := newTrashHome(t)
	target := h.write(t, "Projects/sealed/data", 5)
	ids := h.measure(t, target)
	sealed := filepath.Dir(target)
	if err := os.Chmod(sealed, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chmod(sealed, 0o755); err != nil {
			t.Error(err)
		}
	})

	report, err := h.engine.MoveToTrash(context.Background(), ids, nil)
	if err != nil {
		t.Fatal(err)
	}

	if got := skipReason(t, report, ids[0]); got != removal.PermissionDenied {
		t.Errorf("skip reason = %q, want permission_denied", got)
	}
}

// A picked folder covers what lies in it, whatever order the ids came in, so
// the same bytes are never counted twice.
func TestMoveToTrashCountsAFolderOnce(t *testing.T) {
	tests := []struct {
		name  string
		order []int
	}{
		{name: "folder first", order: []int{0, 1}},
		{name: "folder last", order: []int{1, 0}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			h := newTrashHome(t)
			inner := h.write(t, "Projects/old/data", 5)
			folder := filepath.Dir(inner)
			h.measurer.measurement = Measurement{Items: []MeasuredItem{
				{Name: "old", Path: folder, Bytes: 5, IsDir: true, ReadState: ReadComplete},
				{Name: "data", Path: inner, Bytes: 5, ReadState: ReadComplete},
			}}
			if _, err := h.engine.Measure(context.Background(), MeasureTarget{Kind: Overview}); err != nil {
				t.Fatal(err)
			}
			ids := []string{itemID(folder), itemID(inner)}

			report, err := h.engine.MoveToTrash(context.Background(), []string{ids[test.order[0]], ids[test.order[1]]}, nil)
			if err != nil {
				t.Fatal(err)
			}

			if report.MovedBytes != 5 {
				t.Errorf("movedBytes = %d, want 5", report.MovedBytes)
			}
			if got := skipReason(t, report, itemID(inner)); got != removal.AlreadyGone {
				t.Errorf("the file's skip reason = %q, want already_gone", got)
			}
			if !slices.Equal(h.remover.Trashed(), []string{folder}) {
				t.Errorf("trashed %v, want the folder only", h.remover.Trashed())
			}
		})
	}
}

func TestMoveToTrashTakesARepeatedIDOnce(t *testing.T) {
	h := newTrashHome(t)
	ids := h.measure(t, h.write(t, "Projects/old/data", 5))

	report, err := h.engine.MoveToTrash(context.Background(), []string{ids[0], ids[0]}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(report.Items) != 1 || report.MovedBytes != 5 {
		t.Errorf("report = %+v, want the item once", report)
	}
}

// The size is the latest Measure's, whichever result was measured last.
func TestMoveToTrashCountsTheLatestMeasuredSize(t *testing.T) {
	h := newTrashHome(t)
	path := h.write(t, "Projects/old/data", 5)
	h.measure(t, path)
	h.measurer.measurement = Measurement{Items: []MeasuredItem{{Name: "data", Path: path, Bytes: 9, ReadState: ReadComplete}}}
	if _, err := h.engine.Measure(context.Background(), MeasureTarget{Kind: Folder, Path: filepath.Dir(path)}); err != nil {
		t.Fatal(err)
	}

	report, err := h.engine.MoveToTrash(context.Background(), []string{itemID(path)}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if report.MovedBytes != 9 {
		t.Errorf("movedBytes = %d, want the latest 9", report.MovedBytes)
	}
}

// What left the disk leaves the engine's sizes too, as it does the UI's: a
// later run counts what the folder still holds.
func TestMoveToTrashCountsOnlyWhatIsLeftOfAFolderItMovedFrom(t *testing.T) {
	h := newTrashHome(t)
	child := h.write(t, "Projects/old/child", 64)
	rest := h.write(t, "Projects/old/rest", 57)
	folder := filepath.Dir(child)
	h.measurer.measurement = Measurement{Items: []MeasuredItem{
		{Name: "old", Path: folder, Bytes: 121, IsDir: true, ReadState: ReadComplete},
		{Name: "child", Path: child, Bytes: 64, ReadState: ReadComplete},
		{Name: "rest", Path: rest, Bytes: 57, ReadState: ReadComplete},
	}}
	if _, err := h.engine.Measure(context.Background(), MeasureTarget{Kind: Overview}); err != nil {
		t.Fatal(err)
	}
	if _, err := h.engine.MoveToTrash(context.Background(), []string{itemID(child)}, nil); err != nil {
		t.Fatal(err)
	}

	report, err := h.engine.MoveToTrash(context.Background(), []string{itemID(folder)}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if report.MovedBytes != 57 {
		t.Errorf("movedBytes = %d, want the 57 left", report.MovedBytes)
	}
}

// A folder and what lies in it, moved in one run, leave the folder above
// them lighter by the folder alone.
func TestMoveToTrashTakesAFolderAndItsContentsOffTheFolderAboveOnce(t *testing.T) {
	h := newTrashHome(t)
	child := h.write(t, "Projects/parent/old/child", 5)
	rest := h.write(t, "Projects/parent/rest", 7)
	folder := filepath.Dir(child)
	parent := filepath.Dir(folder)
	h.measurer.measurement = Measurement{Items: []MeasuredItem{
		{Name: "parent", Path: parent, Bytes: 12, IsDir: true, ReadState: ReadComplete},
		{Name: "old", Path: folder, Bytes: 5, IsDir: true, ReadState: ReadComplete},
		{Name: "child", Path: child, Bytes: 5, ReadState: ReadComplete},
		{Name: "rest", Path: rest, Bytes: 7, ReadState: ReadComplete},
	}}
	if _, err := h.engine.Measure(context.Background(), MeasureTarget{Kind: Overview}); err != nil {
		t.Fatal(err)
	}
	if _, err := h.engine.MoveToTrash(context.Background(), []string{itemID(folder), itemID(child)}, nil); err != nil {
		t.Fatal(err)
	}

	report, err := h.engine.MoveToTrash(context.Background(), []string{itemID(parent)}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if report.MovedBytes != 7 {
		t.Errorf("movedBytes = %d, want the 7 left", report.MovedBytes)
	}
}

// Once moved, an item is no longer in a current result.
func TestMoveToTrashForgetsWhatLeftTheDisk(t *testing.T) {
	h := newTrashHome(t)
	child := h.write(t, "Projects/old/child", 5)
	folder := filepath.Dir(child)
	h.measure(t, folder, child)

	if _, err := h.engine.MoveToTrash(context.Background(), []string{itemID(folder)}, nil); err != nil {
		t.Fatal(err)
	}

	for _, path := range []string{folder, child} {
		if _, ok := h.engine.measuredPath(itemID(path)); ok {
			t.Errorf("%s, moved to Trash, still resolves", path)
		}
	}
}

// A skipped item stays where it was, so it keeps its size and its id.
func TestMoveToTrashRemembersWhatItSkipped(t *testing.T) {
	h := newTrashHome(t)
	path := h.write(t, "Projects/old/data", 5)
	h.remover.Fail = func(string) error { return fs.ErrPermission }
	ids := h.measure(t, path)

	if _, err := h.engine.MoveToTrash(context.Background(), ids, nil); err != nil {
		t.Fatal(err)
	}

	if _, ok := h.engine.measuredPath(ids[0]); !ok {
		t.Error("a skipped item no longer resolves")
	}
}

func TestMoveToTrashReportsNamesThePickedItemsAsMeasured(t *testing.T) {
	h := newTrashHome(t)
	path := h.write(t, "Projects/old/data", 5)
	h.measurer.measurement = Measurement{Items: []MeasuredItem{{Name: "Old data", Path: path, Bytes: 5, ReadState: ReadComplete}}}
	if _, err := h.engine.Measure(context.Background(), MeasureTarget{Kind: Overview}); err != nil {
		t.Fatal(err)
	}

	report, err := h.engine.MoveToTrash(context.Background(), []string{itemID(path)}, nil)
	if err != nil {
		t.Fatal(err)
	}

	want := TrashedItem{ID: itemID(path), Name: "Old data", Path: path, Bytes: 5}
	if len(report.Items) != 1 || report.Items[0] != want {
		t.Errorf("items = %+v, want %+v", report.Items, want)
	}
}

func TestMoveToTrashReportsProgressPerItem(t *testing.T) {
	h := newTrashHome(t)
	moved := h.write(t, "Projects/a/data", 10)
	skipped := h.write(t, ".ssh/id_ed25519", 99)
	alsoMoved := h.write(t, "Projects/b/data", 20)
	ids := h.measure(t, moved, skipped, alsoMoved)
	var progress []TrashProgress

	_, err := h.engine.MoveToTrash(context.Background(), ids, func(update TrashProgress) error {
		progress = append(progress, update)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	want := []TrashProgress{
		{Total: 3, Processed: 0, MovedBytes: 0},
		{Total: 3, Processed: 1, MovedBytes: 0},
		{Total: 3, Processed: 2, MovedBytes: 10},
		{Total: 3, Processed: 3, MovedBytes: 30},
	}
	if !slices.Equal(progress, want) {
		t.Errorf("progress = %+v, want %+v", progress, want)
	}
}

func TestMoveToTrashStopsWhenItsContextEnds(t *testing.T) {
	h := newTrashHome(t)
	first := h.write(t, "Projects/a/data", 10)
	second := h.write(t, "Projects/b/data", 20)
	ids := h.measure(t, first, second)
	ctx, cancel := context.WithCancel(context.Background())
	sent := 0

	report, err := h.engine.MoveToTrash(ctx, ids, func(TrashProgress) error {
		sent++
		if sent == 2 {
			cancel()
		}
		return nil
	})

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
	assertGone(t, first)
	assertExists(t, second)
	if len(report.Items) != 1 {
		t.Errorf("report = %+v, want the one item moved before it stopped", report)
	}
}

func TestMoveToTrashStopsWhenProgressCannotBeSent(t *testing.T) {
	h := newTrashHome(t)
	path := h.write(t, "Projects/a/data", 10)
	ids := h.measure(t, path)
	closed := errors.New("channel closed")

	_, err := h.engine.MoveToTrash(context.Background(), ids, func(TrashProgress) error { return closed })

	if !errors.Is(err, closed) {
		t.Fatalf("error = %v, want the send's error", err)
	}
	assertExists(t, path)
}

func TestMoveToTrashLogsOneHistoryLinePerRun(t *testing.T) {
	h := newTrashHome(t)
	moved := h.write(t, "Projects/a/data", 10)
	refused := h.write(t, ".ssh/id_ed25519", 99)
	next := h.write(t, "Projects/b/data", 20)
	ids := h.measure(t, moved, refused, next)
	forged := itemID(h.path + "/never-measured")

	if _, err := h.engine.MoveToTrash(context.Background(), []string{ids[0], ids[1], forged}, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := h.engine.MoveToTrash(context.Background(), []string{ids[2]}, nil); err != nil {
		t.Fatal(err)
	}

	runs := removaltest.History(t, h.path)
	if len(runs) != 2 {
		t.Fatalf("history has %d lines, want 2", len(runs))
	}
	want := []removal.HistoryItem{
		{ID: forged, Method: removal.MoveToTrash, Outcome: removal.Skipped, Reason: removal.Protected},
		{ID: ids[1], Path: refused, Bytes: 99, Method: removal.MoveToTrash, Outcome: removal.Skipped, Reason: removal.Protected},
		{ID: ids[0], Path: moved, Bytes: 10, Method: removal.MoveToTrash, Outcome: removal.Removed},
	}
	if !sameItems(runs[0].Items, want) {
		t.Errorf("first run = %+v, want %+v", runs[0].Items, want)
	}
	if len(runs[1].Items) != 1 || runs[1].Items[0].Path != next {
		t.Errorf("second run = %+v, want %s", runs[1].Items, next)
	}
}

// sameItems compares two lists, ignoring order: the run's order is not the
// history's point.
func sameItems(got, want []removal.HistoryItem) bool {
	return len(got) == len(want) && !slices.ContainsFunc(want, func(item removal.HistoryItem) bool {
		return !slices.Contains(got, item)
	})
}

func TestMoveToTrashLogsAStoppedRun(t *testing.T) {
	h := newTrashHome(t)
	ids := h.measure(t, h.write(t, "Projects/a/data", 10))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := h.engine.MoveToTrash(ctx, ids, nil); err == nil {
		t.Fatal("MoveToTrash with a cancelled context succeeded")
	}

	runs := removaltest.History(t, h.path)
	if len(runs) != 1 || len(runs[0].Items) != 0 {
		t.Fatalf("history = %+v, want one run that moved nothing", runs)
	}
}

// Writing history is a side check: a move that happened still counts.
func TestMoveToTrashFinishesWhenHistoryCannotBeWritten(t *testing.T) {
	h := newTrashHome(t)
	path := h.write(t, "Projects/a/data", 10)
	h.write(t, "Library/Application Support", 1)
	ids := h.measure(t, path)

	report, err := h.engine.MoveToTrash(context.Background(), ids, nil)
	if err != nil {
		t.Fatal(err)
	}

	if report.MovedBytes != 10 {
		t.Errorf("movedBytes = %d, want 10", report.MovedBytes)
	}
}

func TestMoveToTrashFailsWithoutAHome(t *testing.T) {
	remover := &removaltest.FakeRemover{TrashDir: filepath.Join(t.TempDir(), "trash")}
	engine := NewEngine(Options{Measurer: &fakeMeasurer{}, Home: filepath.Join(t.TempDir(), "missing"), Remover: remover})

	if _, err := engine.MoveToTrash(context.Background(), nil, nil); err == nil {
		t.Fatal("MoveToTrash succeeded, want an error")
	}
}
