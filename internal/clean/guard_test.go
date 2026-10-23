package clean_test

import (
	"context"
	"os"
	"path/filepath"
	"syscall"
	"testing"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/clean/cleantest"
)

// validCache is the item cleanWithValidItem cleans next to the one under test.
const validCache = "Library/Caches/valid.cache"

// cleanWithValidItem cleans item next to a valid one, which must still be
// deleted: a skipped item never stops the run.
func cleanWithValidItem(t *testing.T, home string, item clean.JunkItem) clean.CleanReport {
	t.Helper()
	valid := writeFile(t, home, validCache, 10)
	engine := scannedEngine(t, home, clean.JunkGroup{
		ID:            clean.AppCaches,
		RemovalMethod: clean.Delete,
		Items:         []clean.JunkItem{item, {ID: "valid", Path: valid, Bytes: 10}},
	})
	report, err := engine.Clean(context.Background(), []string{item.ID, "valid"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	assertGone(t, valid)
	return report
}

func assertSkipped(t *testing.T, home string, report clean.CleanReport, item clean.JunkItem, want clean.SkipReason) {
	t.Helper()
	assertReport(t, report, clean.CleanReport{
		Items: []clean.CleanedItem{
			{ID: item.ID, Path: item.Path, Bytes: item.Bytes, Method: method(clean.Delete), SkipReason: reason(want)},
			{ID: "valid", Path: filepath.Join(home, validCache), Bytes: 10, Method: method(clean.Delete)},
		},
		FreedBytes: 10,
	})
}

func TestCleanSkipsAnIDTheCurrentScanDidNotList(t *testing.T) {
	home := newHome(t)
	valid := writeFile(t, home, validCache, 10)
	engine := scannedEngine(t, home, clean.JunkGroup{
		ID:            clean.AppCaches,
		RemovalMethod: clean.Delete,
		Items:         []clean.JunkItem{{ID: "valid", Path: valid, Bytes: 10}},
	})

	report, err := engine.Clean(context.Background(), []string{"forged", "valid"}, nil)
	if err != nil {
		t.Fatal(err)
	}

	assertGone(t, valid)
	assertReport(t, report, clean.CleanReport{
		Items: []clean.CleanedItem{
			{ID: "forged", SkipReason: reason(clean.Protected)},
			{ID: "valid", Path: valid, Bytes: 10, Method: method(clean.Delete)},
		},
		FreedBytes: 10,
	})
}

func TestCleanSkipsADotDotPath(t *testing.T) {
	home := newHome(t)
	target := writeFile(t, home, "Documents/thesis.txt", 5)
	item := clean.JunkItem{ID: "dotdot", Path: filepath.Join(home, "Library/Caches") + "/../../Documents/thesis.txt", Bytes: 5}

	report := cleanWithValidItem(t, home, item)

	assertExists(t, target)
	assertSkipped(t, home, report, item, clean.Protected)
}

func TestCleanSkipsARelativePath(t *testing.T) {
	home := newHome(t)
	item := clean.JunkItem{ID: "relative", Path: "Library/Caches/thing", Bytes: 5}

	report := cleanWithValidItem(t, home, item)

	assertSkipped(t, home, report, item, clean.Protected)
}

func TestCleanSkipsAPathOutsideHome(t *testing.T) {
	home := newHome(t)
	outside := writeFile(t, t.TempDir(), "elsewhere/data.bin", 5)
	item := clean.JunkItem{ID: "outside", Path: outside, Bytes: 5}

	report := cleanWithValidItem(t, home, item)

	assertExists(t, outside)
	assertSkipped(t, home, report, item, clean.Protected)
}

func TestCleanSkipsAPathWithControlCharacters(t *testing.T) {
	home := newHome(t)
	odd := writeFile(t, home, "Library/Caches/line\nbreak", 5)
	item := clean.JunkItem{ID: "control", Path: odd, Bytes: 5}

	report := cleanWithValidItem(t, home, item)

	assertExists(t, odd)
	assertSkipped(t, home, report, item, clean.Protected)
}

func TestCleanSkipsAnItemBelowASymlinkedParentThatLeavesHome(t *testing.T) {
	home := newHome(t)
	victim := t.TempDir()
	precious := writeFile(t, victim, "cache.db", 5)
	if err := os.MkdirAll(filepath.Join(home, "Library"), 0o755); err != nil {
		t.Fatal(err)
	}
	symlink(t, victim, filepath.Join(home, "Library/Caches"))
	item := clean.JunkItem{ID: "parent-link", Path: filepath.Join(home, "Library/Caches/cache.db"), Bytes: 5}

	report := cleanOne(t, home, item)

	assertExists(t, precious)
	assertReport(t, report, clean.CleanReport{Items: []clean.CleanedItem{
		{ID: item.ID, Path: item.Path, Bytes: 5, Method: method(clean.Delete), SkipReason: reason(clean.Protected)},
	}})
}

func TestCleanSkipsAnItemBelowASymlinkedParentThatReachesAProtectedFolder(t *testing.T) {
	home := newHome(t)
	document := writeFile(t, home, "Documents/taxes.pdf", 5)
	if err := os.MkdirAll(filepath.Join(home, "Library/Caches"), 0o755); err != nil {
		t.Fatal(err)
	}
	symlink(t, filepath.Join(home, "Documents"), filepath.Join(home, "Library/Caches/redirect"))
	item := clean.JunkItem{ID: "into-documents", Path: filepath.Join(home, "Library/Caches/redirect/taxes.pdf"), Bytes: 5}

	report := cleanWithValidItem(t, home, item)

	assertExists(t, document)
	assertSkipped(t, home, report, item, clean.Protected)
}

func TestCleanSkipsASymlinkPointingBackToTheRealHome(t *testing.T) {
	home := newHome(t)
	// Stands in for the real home folder, which tests never touch.
	realHome := t.TempDir()
	precious := writeFile(t, realHome, "Documents/novel.txt", 5)
	if err := os.MkdirAll(filepath.Join(home, "Library/Caches"), 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(home, "Library/Caches/home-link")
	symlink(t, realHome, link)
	item := clean.JunkItem{ID: "home-link", Path: link, Bytes: 5}

	report := cleanWithValidItem(t, home, item)

	assertExists(t, precious)
	assertExists(t, link)
	assertSkipped(t, home, report, item, clean.Protected)
}

func TestCleanSkipsProtectedPaths(t *testing.T) {
	for _, rel := range []string{
		"",
		"Documents",
		"Desktop/notes.txt",
		"documents/lowercase.txt",
		"Pictures/Photos Library.photoslibrary",
		"Library/Mobile Documents/com~apple~CloudDocs",
		"Library",
		".config/mole/whitelist",
		"Library/Application Support/Burrow/history.jsonl",
	} {
		t.Run(rel, func(t *testing.T) {
			home := newHome(t)
			path := filepath.Join(home, rel)
			kept := writeFile(t, path, "kept.txt", 5)
			item := clean.JunkItem{ID: "protected", Path: path, Bytes: 5}

			report := cleanWithValidItem(t, home, item)

			assertExists(t, kept)
			assertSkipped(t, home, report, item, clean.Protected)
		})
	}
}

func TestCleanReportsAnItemThatVanishedAfterTheScanAsAlreadyGone(t *testing.T) {
	home := newHome(t)
	gone := writeFile(t, home, "Library/Caches/gone.cache", 5)
	item := clean.JunkItem{ID: "gone", Path: gone, Bytes: 5}
	valid := writeFile(t, home, validCache, 10)
	engine := scannedEngine(t, home, clean.JunkGroup{
		ID:            clean.AppCaches,
		RemovalMethod: clean.Delete,
		Items:         []clean.JunkItem{item, {ID: "valid", Path: valid, Bytes: 10}},
	})
	if err := os.Remove(gone); err != nil {
		t.Fatal(err)
	}

	report, err := engine.Clean(context.Background(), []string{"gone", "valid"}, nil)
	if err != nil {
		t.Fatal(err)
	}

	assertSkipped(t, home, report, item, clean.AlreadyGone)
}

func TestCleanReportsAnItemItCannotRemoveAsPermissionDenied(t *testing.T) {
	home := newHome(t)
	locked := writeFile(t, home, "Library/Caches/locked/data.cache", 5)
	lockedDir := filepath.Dir(locked)
	if err := os.Chmod(lockedDir, 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(lockedDir, 0o755) })
	item := clean.JunkItem{ID: "locked", Path: locked, Bytes: 5}

	report := cleanWithValidItem(t, home, item)

	assertExists(t, locked)
	assertSkipped(t, home, report, item, clean.PermissionDenied)
}

func TestCleanReportsABusyItemAsInUse(t *testing.T) {
	home := newHome(t)
	busy := writeFile(t, home, "Library/Caches/busy.cache", 5)
	valid := writeFile(t, home, validCache, 10)
	remover := &cleantest.FakeRemover{Fail: func(path string) error {
		if path == busy {
			return &os.PathError{Op: "unlinkat", Path: path, Err: syscall.EBUSY}
		}
		return nil
	}}
	item := clean.JunkItem{ID: "busy", Path: busy, Bytes: 5}
	engine := clean.NewEngine(clean.Options{
		Scanner: fixedScan(clean.JunkGroup{
			ID:            clean.AppCaches,
			RemovalMethod: clean.Delete,
			Items:         []clean.JunkItem{item, {ID: "valid", Path: valid, Bytes: 10}},
		}),
		Home:    home,
		Remover: remover,
		Logger:  quiet,
	})
	if _, err := engine.Scan(context.Background(), nil); err != nil {
		t.Fatal(err)
	}

	report, err := engine.Clean(context.Background(), []string{"busy", "valid"}, nil)
	if err != nil {
		t.Fatal(err)
	}

	assertExists(t, busy)
	assertSkipped(t, home, report, item, clean.InUse)
}

// cleanOne cleans item alone, for fixtures where no valid item can sit.
func cleanOne(t *testing.T, home string, item clean.JunkItem) clean.CleanReport {
	t.Helper()
	engine := scannedEngine(t, home, clean.JunkGroup{
		ID:            clean.AppCaches,
		RemovalMethod: clean.Delete,
		Items:         []clean.JunkItem{item},
	})
	report, err := engine.Clean(context.Background(), []string{item.ID}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return report
}

func symlink(t *testing.T, target, link string) {
	t.Helper()
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
}
