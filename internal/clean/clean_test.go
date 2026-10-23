package clean_test

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/clean/cleantest"
)

func TestCleanDeletesSelectedItemsAndKeepsTheRest(t *testing.T) {
	home := newHome(t)
	logs := writeFile(t, home, "Library/Logs/App/app.log", 2_000)
	trash := writeFile(t, home, ".Trash/old.data", 3_000)
	engine := scannedEngine(t, home, clean.JunkGroup{
		ID:            clean.LogsSavedState,
		RemovalMethod: clean.Delete,
		Items: []clean.JunkItem{
			{ID: "logs", Path: filepath.Dir(logs), Bytes: 2_000},
			{ID: "trash", Path: trash, Bytes: 3_000},
		},
	})

	report, err := engine.Clean(context.Background(), []string{"logs"}, nil)
	if err != nil {
		t.Fatal(err)
	}

	assertGone(t, filepath.Dir(logs))
	assertExists(t, trash)
	want := clean.CleanReport{
		Items:      []clean.CleanedItem{{ID: "logs", Path: filepath.Dir(logs), Bytes: 2_000, Method: method(clean.Delete)}},
		FreedBytes: 2_000,
	}
	assertReport(t, report, want)
}

// scannedEngine returns an Engine whose current ScanResult holds groups.
func scannedEngine(t *testing.T, home string, groups ...clean.JunkGroup) *clean.Engine {
	t.Helper()
	return scannedEngineWith(t, home, cleantest.NewFakeProcesses(), groups...)
}

// scannedEngineWith is scannedEngine with processes running on the Mac.
func scannedEngineWith(t *testing.T, home string, processes clean.Processes, groups ...clean.JunkGroup) *clean.Engine {
	t.Helper()
	engine := clean.NewEngine(clean.Options{
		Scanner:   fixedScan(groups...),
		Home:      home,
		Remover:   &cleantest.FakeRemover{},
		Processes: processes,
		Logger:    quiet,
	})
	if _, err := engine.Scan(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
	return engine
}

// quiet drops the engine's logs, which skipped items produce on purpose.
var quiet = slog.New(slog.DiscardHandler)

// fixedScan always finds groups.
func fixedScan(groups ...clean.JunkGroup) clean.Scanner {
	return scannerFunc(func(context.Context, func(clean.ScanProgress) error) (clean.ScanResult, error) {
		return clean.ScanResult{Groups: groups}, nil
	})
}

func newHome(t *testing.T) string {
	t.Helper()
	home := filepath.Join(t.TempDir(), "home")
	if err := os.Mkdir(home, 0o755); err != nil {
		t.Fatal(err)
	}
	return home
}

// writeFile creates a file of size bytes at rel under home and returns its path.
func writeFile(t *testing.T, home, rel string, size int64) string {
	t.Helper()
	path := filepath.Join(home, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, make([]byte, size), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func method(m clean.RemovalMethod) *clean.RemovalMethod { return &m }

func reason(r clean.SkipReason) *clean.SkipReason { return &r }

func assertGone(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Errorf("%s still exists (lstat error %v)", path, err)
	}
}

func assertExists(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Lstat(path); err != nil {
		t.Errorf("%s was removed: %v", path, err)
	}
}

func assertReport(t *testing.T, got, want clean.CleanReport) {
	t.Helper()
	if got.FreedBytes != want.FreedBytes {
		t.Errorf("FreedBytes = %d, want %d", got.FreedBytes, want.FreedBytes)
	}
	if g, w := views(got.Items), views(want.Items); !slices.Equal(g, w) {
		t.Errorf("report items =\n%+v\nwant\n%+v", g, w)
	}
}

// itemView is a CleanedItem with its optional fields spelled out, so items
// compare and print by value.
type itemView struct {
	ID, Path, Method, SkipReason string
	Bytes                        int64
}

func views(items []clean.CleanedItem) []itemView {
	out := make([]itemView, 0, len(items))
	for _, item := range items {
		view := itemView{ID: item.ID, Path: item.Path, Bytes: item.Bytes, Method: "-", SkipReason: "-"}
		if item.Method != nil {
			view.Method = string(*item.Method)
		}
		if item.SkipReason != nil {
			view.SkipReason = string(*item.SkipReason)
		}
		out = append(out, view)
	}
	return out
}

func TestCleanRefusesMoveToTrashItemsBeforeRemovingAnything(t *testing.T) {
	home := newHome(t)
	cache := writeFile(t, home, "Library/Caches/app.cache", 10)
	leftover := writeFile(t, home, "Library/Application Support/Gone App/data", 20)
	engine := scannedEngine(t, home,
		clean.JunkGroup{ID: clean.AppCaches, RemovalMethod: clean.Delete, Items: []clean.JunkItem{{ID: "cache", Path: cache, Bytes: 10}}},
		clean.JunkGroup{ID: clean.AppLeftovers, RemovalMethod: clean.MoveToTrash, Items: []clean.JunkItem{{ID: "leftover", Path: leftover, Bytes: 20}}},
	)

	_, err := engine.Clean(context.Background(), []string{"cache", "leftover"}, nil)

	if !errors.Is(err, clean.ErrMoveToTrashUnavailable) {
		t.Fatalf("Clean error = %v, want ErrMoveToTrashUnavailable", err)
	}
	assertExists(t, cache)
	assertExists(t, leftover)
}

func TestCleanReportsProgressByJunkGroup(t *testing.T) {
	home := newHome(t)
	cacheA := writeFile(t, home, "Library/Caches/a.cache", 100)
	cacheB := writeFile(t, home, "Library/Caches/b.cache", 200)
	trash := writeFile(t, home, ".Trash/old.data", 300)
	engine := scannedEngine(t, home,
		clean.JunkGroup{ID: clean.AppCaches, RemovalMethod: clean.Delete, Items: []clean.JunkItem{
			{ID: "a", Path: cacheA, Bytes: 100},
			{ID: "documents", Path: filepath.Join(home, "Documents"), Bytes: 50},
			{ID: "b", Path: cacheB, Bytes: 200},
		}},
		clean.JunkGroup{ID: clean.Trash, RemovalMethod: clean.Delete, Items: []clean.JunkItem{{ID: "trash", Path: trash, Bytes: 300}}},
	)
	var got []clean.CleanProgress

	_, err := engine.Clean(context.Background(), []string{"trash", "a", "documents", "b"}, func(p clean.CleanProgress) error {
		got = append(got, p)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	want := []clean.CleanProgress{
		{GroupID: clean.AppCaches, Selected: 3},
		{GroupID: clean.AppCaches, Selected: 3, Cleaned: 1, FreedBytes: 100},
		{GroupID: clean.AppCaches, Selected: 3, Cleaned: 1, Skipped: 1, FreedBytes: 100},
		{GroupID: clean.AppCaches, Selected: 3, Cleaned: 2, Skipped: 1, FreedBytes: 300},
		{GroupID: clean.Trash, Selected: 1, FreedBytes: 300},
		{GroupID: clean.Trash, Selected: 1, Cleaned: 1, FreedBytes: 600},
	}
	if !slices.Equal(got, want) {
		t.Errorf("progress =\n%+v\nwant\n%+v", got, want)
	}
}

func TestCleanStopsWhenThePageStopsListening(t *testing.T) {
	home := newHome(t)
	first := writeFile(t, home, "Library/Caches/first.cache", 1)
	second := writeFile(t, home, "Library/Caches/second.cache", 1)
	engine := scannedEngine(t, home, clean.JunkGroup{ID: clean.AppCaches, RemovalMethod: clean.Delete, Items: []clean.JunkItem{
		{ID: "first", Path: first, Bytes: 1},
		{ID: "second", Path: second, Bytes: 1},
	}})
	closed := errors.New("channel closed")
	sent := 0

	report, err := engine.Clean(context.Background(), []string{"first", "second"}, func(clean.CleanProgress) error {
		sent++
		if sent == 2 {
			return closed
		}
		return nil
	})

	if !errors.Is(err, closed) {
		t.Fatalf("Clean error = %v, want the progress error", err)
	}
	assertGone(t, first)
	assertExists(t, second)
	assertReport(t, report, clean.CleanReport{
		Items:      []clean.CleanedItem{{ID: "first", Path: first, Bytes: 1, Method: method(clean.Delete)}},
		FreedBytes: 1,
	})
}

func TestCleanIsRefusedWhileAScanRuns(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	engine := clean.NewEngine(clean.Options{
		Scanner: scannerFunc(func(context.Context, func(clean.ScanProgress) error) (clean.ScanResult, error) {
			close(started)
			<-release
			return clean.ScanResult{}, nil
		}),
		Home:      newHome(t),
		Remover:   &cleantest.FakeRemover{},
		Processes: cleantest.NewFakeProcesses(),
		Logger:    quiet,
	})
	scanned := make(chan error, 1)
	go func() {
		_, err := engine.Scan(context.Background(), nil)
		scanned <- err
	}()
	<-started

	_, err := engine.Clean(context.Background(), []string{"anything"}, nil)
	close(release)

	if !errors.Is(err, clean.ErrBusy) {
		t.Fatalf("Clean during Scan error = %v, want ErrBusy", err)
	}
	if err := <-scanned; err != nil {
		t.Fatal(err)
	}
}
