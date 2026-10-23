package clean_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/clean/cleantest"
)

func TestLockedNamesTheRunningBrowsersThatLockBrowsers(t *testing.T) {
	processes := cleantest.NewFakeProcesses("Finder", "Safari", "Google Chrome Helper", "firefox")
	engine := clean.NewEngine(clean.Options{Processes: processes})

	locked, err := engine.Locked()
	if err != nil {
		t.Fatal(err)
	}

	want := []clean.LockedGroup{{ID: clean.Browsers, Apps: []string{"Safari", "Firefox"}}}
	if !slices.EqualFunc(locked, want, equalLock) {
		t.Fatalf("Locked() = %#v, want %#v", locked, want)
	}
}

func TestLockedIsEmptyWhileNoBrowserRuns(t *testing.T) {
	engine := clean.NewEngine(clean.Options{Processes: cleantest.NewFakeProcesses("Finder", "SafariBookmarksS")})

	locked, err := engine.Locked()
	if err != nil {
		t.Fatal(err)
	}
	if len(locked) != 0 {
		t.Fatalf("Locked() = %#v, want none", locked)
	}
}

func TestScanReportsTheLockedJunkGroups(t *testing.T) {
	engine := clean.NewEngine(clean.Options{
		Scanner:   fixedScan(clean.JunkGroup{ID: clean.Browsers}),
		Processes: cleantest.NewFakeProcesses("Arc"),
	})

	result, err := engine.Scan(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}

	want := []clean.LockedGroup{{ID: clean.Browsers, Apps: []string{"Arc"}}}
	if !slices.EqualFunc(result.Locked, want, equalLock) {
		t.Fatalf("Scan Locked = %#v, want %#v", result.Locked, want)
	}
}

func TestScanStillEndsWhenItCannotTellWhichAppsRun(t *testing.T) {
	processes := cleantest.NewFakeProcesses()
	processes.Fail(errors.New("sysctl refused"))
	engine := clean.NewEngine(clean.Options{
		Scanner:   fixedScan(clean.JunkGroup{ID: clean.Browsers}),
		Processes: processes,
		Logger:    quiet,
	})

	result, err := engine.Scan(context.Background(), nil)
	if err != nil {
		t.Fatalf("Scan error = %v, want the Scan to end", err)
	}
	// Review learns the locks on its next ask; Clean still refuses the group.
	if len(result.Locked) != 0 || len(result.Groups) != 1 {
		t.Fatalf("Scan = %#v, want the group and no locks", result)
	}
}

func TestCleanSkipsTheItemsOfALockedGroupAsInUse(t *testing.T) {
	home := newHome(t)
	chrome := writeFile(t, home, "Library/Caches/Google/Chrome/cache.db", 2_000)
	logs := writeFile(t, home, "Library/Logs/app.log", 1_000)
	processes := cleantest.NewFakeProcesses()
	engine := scannedEngineWith(t, home, processes,
		clean.JunkGroup{ID: clean.Browsers, RemovalMethod: clean.Delete, Items: []clean.JunkItem{{ID: "chrome", Path: chrome, Bytes: 2_000}}},
		clean.JunkGroup{ID: clean.LogsSavedState, RemovalMethod: clean.Delete, Items: []clean.JunkItem{{ID: "logs", Path: logs, Bytes: 1_000}}},
	)
	// Chrome starts between Review and Clean: the page still sends its items.
	processes.Set("Google Chrome")

	report, err := engine.Clean(context.Background(), []string{"chrome", "logs"}, nil)
	if err != nil {
		t.Fatal(err)
	}

	assertExists(t, chrome)
	assertGone(t, logs)
	assertReport(t, report, clean.CleanReport{
		Items: []clean.CleanedItem{
			{ID: "chrome", Path: chrome, Bytes: 2_000, Method: method(clean.Delete), SkipReason: reason(clean.InUse)},
			{ID: "logs", Path: logs, Bytes: 1_000, Method: method(clean.Delete)},
		},
		FreedBytes: 1_000,
	})
}

func TestCleanSkipsTheRestOfAGroupOnceItsAppStartsMidway(t *testing.T) {
	home := newHome(t)
	first := writeFile(t, home, "Library/Caches/com.apple.Safari/first.db", 1_000)
	second := writeFile(t, home, "Library/Caches/com.apple.Safari/second.db", 2_000)
	processes := cleantest.NewFakeProcesses()
	remover := &cleantest.FakeRemover{Fail: func(string) error {
		processes.Set("Safari")
		return nil
	}}
	engine := clean.NewEngine(clean.Options{
		Scanner: fixedScan(clean.JunkGroup{ID: clean.Browsers, RemovalMethod: clean.Delete, Items: []clean.JunkItem{
			{ID: "first", Path: first, Bytes: 1_000},
			{ID: "second", Path: second, Bytes: 2_000},
		}}),
		Home:      home,
		Remover:   remover,
		Processes: processes,
		Logger:    quiet,
	})
	if _, err := engine.Scan(context.Background(), nil); err != nil {
		t.Fatal(err)
	}

	report, err := engine.Clean(context.Background(), []string{"first", "second"}, nil)
	if err != nil {
		t.Fatal(err)
	}

	assertGone(t, first)
	assertExists(t, second)
	assertReport(t, report, clean.CleanReport{
		Items: []clean.CleanedItem{
			{ID: "first", Path: first, Bytes: 1_000, Method: method(clean.Delete)},
			{ID: "second", Path: second, Bytes: 2_000, Method: method(clean.Delete), SkipReason: reason(clean.InUse)},
		},
		FreedBytes: 1_000,
	})
}

func TestCleanCleansABrowsersGroupOnceTheBrowserQuits(t *testing.T) {
	home := newHome(t)
	safari := writeFile(t, home, "Library/Caches/com.apple.Safari/cache.db", 2_000)
	processes := cleantest.NewFakeProcesses("Safari")
	engine := scannedEngineWith(t, home, processes, clean.JunkGroup{
		ID: clean.Browsers, RemovalMethod: clean.Delete, Items: []clean.JunkItem{{ID: "safari", Path: safari, Bytes: 2_000}},
	})
	processes.Set()

	report, err := engine.Clean(context.Background(), []string{"safari"}, nil)
	if err != nil {
		t.Fatal(err)
	}

	assertGone(t, safari)
	assertReport(t, report, clean.CleanReport{
		Items:      []clean.CleanedItem{{ID: "safari", Path: safari, Bytes: 2_000, Method: method(clean.Delete)}},
		FreedBytes: 2_000,
	})
}

func TestCleanSkipsALockableGroupAsInUseWhenItCannotTellWhichAppsRun(t *testing.T) {
	home := newHome(t)
	safari := writeFile(t, home, "Library/Caches/com.apple.Safari/cache.db", 2_000)
	processes := cleantest.NewFakeProcesses()
	engine := scannedEngineWith(t, home, processes, clean.JunkGroup{
		ID: clean.Browsers, RemovalMethod: clean.Delete, Items: []clean.JunkItem{{ID: "safari", Path: safari, Bytes: 2_000}},
	})
	processes.Fail(errors.New("sysctl refused"))

	report, err := engine.Clean(context.Background(), []string{"safari"}, nil)
	if err != nil {
		t.Fatal(err)
	}

	assertExists(t, safari)
	assertReport(t, report, clean.CleanReport{
		Items: []clean.CleanedItem{{ID: "safari", Path: safari, Bytes: 2_000, Method: method(clean.Delete), SkipReason: reason(clean.InUse)}},
	})
}

func TestOSProcessesListsThisProcess(t *testing.T) {
	names, err := clean.OSProcesses{}.Names()
	if err != nil {
		t.Fatal(err)
	}
	// The kernel keeps at most 16 bytes of a process name: "clean.test".
	if !slices.Contains(names, "clean.test") {
		t.Fatalf("OSProcesses names miss clean.test among %d processes", len(names))
	}
}

func equalLock(a, b clean.LockedGroup) bool {
	return a.ID == b.ID && slices.Equal(a.Apps, b.Apps)
}
