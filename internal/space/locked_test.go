package space

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/DiiKhanh/burrow/internal/removal"
	"github.com/DiiKhanh/burrow/internal/removal/removaltest"
)

// quiet drops what the engine logs as it degrades, which these tests cause.
var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

// The processes are named as the kernel lists them, cut to 16 bytes.
func TestLockedNamesTheLiveDataOfEachRunningApp(t *testing.T) {
	home := t.TempDir()
	docker := LockedItem{Path: filepath.Join(home, "Library/Containers/com.docker.docker/Data"), App: "Docker"}
	orbStack := LockedItem{Path: filepath.Join(home, "Library/Group Containers/HUAQ24HBR6.dev.orbstack/data"), App: "OrbStack"}
	simulator := LockedItem{Path: filepath.Join(home, "Library/Developer/CoreSimulator/Devices"), App: "Simulator"}
	tests := []struct {
		name    string
		running []string
		want    []LockedItem
	}{
		{"nothing of theirs runs", []string{"Finder", "Safari"}, []LockedItem{}},
		{"Docker's window", []string{"Docker Desktop"}, []LockedItem{docker}},
		{"Docker's backend, with no window", []string{"com.docker.backe"}, []LockedItem{docker}},
		{"Docker's virtual machine", []string{"com.docker.virtu"}, []LockedItem{docker}},
		{"Docker's other virtual machine", []string{"com.docker.krun"}, []LockedItem{docker}},
		{"OrbStack's window", []string{"OrbStack"}, []LockedItem{orbStack}},
		{"OrbStack's virtual machine, with no window", []string{"OrbStack Helper"}, []LockedItem{orbStack}},
		{"Simulator's window", []string{"Simulator"}, []LockedItem{simulator}},
		{"a device booted with no window", []string{"launchd_sim"}, []LockedItem{simulator}},
		{"a helper that outlives Simulator", []string{"SimLaunchHost.ar"}, []LockedItem{}},
		{"all three", []string{"Simulator", "OrbStack", "Docker Desktop"}, []LockedItem{docker, orbStack, simulator}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			engine := NewEngine(Options{Home: home, Processes: removaltest.NewFakeProcesses(test.running...)})

			if got := engine.Locked(); !slices.Equal(got, test.want) {
				t.Errorf("Locked() = %+v, want %+v", got, test.want)
			}
		})
	}
}

// The safe answer when nothing says which apps run is the one that moves less.
func TestLockedTakesEveryOwnerAsRunningWhenItCannotTellWhichAppsRun(t *testing.T) {
	processes := removaltest.NewFakeProcesses()
	processes.Fail(errors.New("sysctl refused"))
	engine := NewEngine(Options{Home: t.TempDir(), Processes: processes, Logger: quiet})

	var apps []string
	for _, item := range engine.Locked() {
		apps = append(apps, item.App)
	}

	if want := []string{"Docker", "OrbStack", "Simulator"}; !slices.Equal(apps, want) {
		t.Errorf("locked apps = %v, want %v", apps, want)
	}
}

const dockerData = "Library/Containers/com.docker.docker/Data"

// linkToDockerData makes Docker Data, with a file in it, and a symlink to it
// elsewhere in Home.
func (h *trashHome) linkToDockerData(t *testing.T) string {
	t.Helper()
	h.write(t, dockerData+"/vms/0/data.bin", 1)
	link := filepath.Join(filepath.Dir(h.write(t, "Projects/keep", 1)), "docker")
	if err := os.Symlink(filepath.Join(h.path, dockerData), link); err != nil {
		t.Fatal(err)
	}
	return link
}

// What Docker holds and what holds it both take live data with them, whether
// the path says so or a symlink does.
func TestMoveToTrashSkipsWhatARunningAppUsesAsInUse(t *testing.T) {
	tests := []struct {
		name  string
		setup func(t *testing.T, h *trashHome) string
	}{
		{"the locked item", func(t *testing.T, h *trashHome) string {
			h.write(t, dockerData+"/vms/0/data.bin", 1)
			return filepath.Join(h.path, dockerData)
		}},
		{"a folder inside it", func(t *testing.T, h *trashHome) string {
			return filepath.Dir(h.write(t, dockerData+"/vms/0/data.bin", 1))
		}},
		{"a file deep inside it", func(t *testing.T, h *trashHome) string {
			return h.write(t, dockerData+"/vms/0/data.bin", 1)
		}},
		{"a folder that holds it", func(t *testing.T, h *trashHome) string {
			h.write(t, dockerData+"/vms/0/data.bin", 1)
			return filepath.Join(h.path, "Library/Containers/com.docker.docker")
		}},
		{"another case of it", func(t *testing.T, h *trashHome) string {
			h.write(t, dockerData+"/vms/0/data.bin", 1)
			return filepath.Join(h.path, "library/containers/COM.docker.docker/data/vms")
		}},
		{"a symlink to it", func(t *testing.T, h *trashHome) string {
			return h.linkToDockerData(t)
		}},
		{"a path through a symlink to it", func(t *testing.T, h *trashHome) string {
			return filepath.Join(h.linkToDockerData(t), "vms/0/data.bin")
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			h := newTrashHome(t)
			h.processes.Set("Docker Desktop")
			valid := h.write(t, "Projects/valid/data", 10)
			path := test.setup(t, h)
			ids := h.measure(t, path, valid)

			report, err := h.engine.MoveToTrash(context.Background(), ids, nil)
			if err != nil {
				t.Fatal(err)
			}

			if got := skipReason(t, report, ids[0]); got != removal.InUse {
				t.Errorf("skip reason = %q, want in_use", got)
			}
			if slices.Contains(h.remover.Trashed(), path) {
				t.Errorf("%s reached the Remover", path)
			}
			assertExists(t, path)
			// One locked item never stops the run.
			assertGone(t, valid)
			if report.MovedBytes != 10 {
				t.Errorf("movedBytes = %d, want only the valid item's 10", report.MovedBytes)
			}
		})
	}
}

func TestMoveToTrashMovesWhatOnlyLooksLikeWhatARunningAppUses(t *testing.T) {
	h := newTrashHome(t)
	h.processes.Set("Docker Desktop")
	sibling := h.write(t, "Library/Containers/com.docker.docker/Data old/file", 5)
	ids := h.measure(t, sibling)

	report, err := h.engine.MoveToTrash(context.Background(), ids, nil)
	if err != nil {
		t.Fatal(err)
	}

	if got := skipReason(t, report, ids[0]); got != "" {
		t.Errorf("skip reason = %q, want it moved", got)
	}
}

// Quitting is all it takes: the ids stay good, so no new Measure is needed.
func TestMoveToTrashMovesALockedItemOnceItsAppQuits(t *testing.T) {
	h := newTrashHome(t)
	h.processes.Set("Docker Desktop")
	path := h.write(t, dockerData+"/vms/0/data.bin", 5)
	ids := h.measure(t, path)
	if _, err := h.engine.MoveToTrash(context.Background(), ids, nil); err != nil {
		t.Fatal(err)
	}
	assertExists(t, path)

	h.processes.Set()
	report, err := h.engine.MoveToTrash(context.Background(), ids, nil)
	if err != nil {
		t.Fatal(err)
	}

	assertGone(t, path)
	if report.MovedBytes != 5 {
		t.Errorf("movedBytes = %d, want 5", report.MovedBytes)
	}
}

// Each item is checked right before it moves, not once for the run.
func TestMoveToTrashSkipsTheRestOnceTheirAppStartsMidway(t *testing.T) {
	h := newTrashHome(t)
	first := h.write(t, dockerData+"/first", 5)
	second := h.write(t, dockerData+"/second", 7)
	h.remover.Fail = func(string) error {
		h.processes.Set("Docker Desktop")
		return nil
	}
	ids := h.measure(t, first, second)

	report, err := h.engine.MoveToTrash(context.Background(), ids, nil)
	if err != nil {
		t.Fatal(err)
	}

	if got := skipReason(t, report, itemID(first)); got != "" {
		t.Errorf("first skip reason = %q, want it moved", got)
	}
	if got := skipReason(t, report, itemID(second)); got != removal.InUse {
		t.Errorf("second skip reason = %q, want in_use", got)
	}
	assertExists(t, second)
}

func TestMoveToTrashSkipsLockableItemsAsInUseWhenItCannotTellWhichAppsRun(t *testing.T) {
	h := newTrashHome(t)
	lockable := h.write(t, dockerData+"/vms/0/data.bin", 5)
	other := h.write(t, "Projects/old/data", 7)
	ids := h.measure(t, lockable, other)
	h.processes.Fail(errors.New("sysctl refused"))

	report, err := h.engine.MoveToTrash(context.Background(), ids, nil)
	if err != nil {
		t.Fatal(err)
	}

	if got := skipReason(t, report, ids[0]); got != removal.InUse {
		t.Errorf("skip reason = %q, want in_use", got)
	}
	assertExists(t, lockable)
	assertGone(t, other)
}

func TestMoveToTrashKeepsALockedItemListedAndLogsItsSkip(t *testing.T) {
	h := newTrashHome(t)
	h.processes.Set("Simulator")
	path := h.write(t, "Library/Developer/CoreSimulator/Devices/ABC/data", 5)
	ids := h.measure(t, path)

	if _, err := h.engine.MoveToTrash(context.Background(), ids, nil); err != nil {
		t.Fatal(err)
	}

	if _, ok := h.engine.measuredPath(ids[0]); !ok {
		t.Error("a locked item no longer resolves")
	}
	runs := removaltest.History(t, h.path)
	want := []removal.HistoryItem{{ID: ids[0], Path: path, Bytes: 5, Method: removal.MoveToTrash, Outcome: removal.Skipped, Reason: removal.InUse}}
	if len(runs) != 1 || !slices.Equal(runs[0].Items, want) {
		t.Errorf("history = %+v, want %+v", runs, want)
	}
}
