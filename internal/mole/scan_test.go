package mole

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/testhome"
)

func TestScannerProgressErrorStopsTheWholeMoleProcessGroup(t *testing.T) {
	home := t.TempDir()
	bundleDir := t.TempDir()
	fakeBundle(t, bundleDir)
	script := `#!/bin/sh
set -eu
sleep 30 &
child=$!
printf '%s\n' "$child" > "$HOME/child.pid"
printf '➤ App caches\n'
wait "$child"
`
	if err := os.WriteFile(filepath.Join(bundleDir, MoPath), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	wantErr := errors.New("progress receiver closed")
	done := make(chan error, 1)
	scanner := NewScanner(Bundle{dir: bundleDir}, home, slog.New(slog.NewTextHandler(io.Discard, nil)))
	go func() {
		_, err := scanner.Scan(context.Background(), func(clean.ScanProgress) error {
			return wantErr
		})
		done <- err
	}()

	childPID := waitForChildPID(t, filepath.Join(home, "child.pid"))
	select {
	case err := <-done:
		if !errors.Is(err, wantErr) {
			t.Fatalf("Scan error = %v, want %v", err, wantErr)
		}
	case <-time.After(500 * time.Millisecond):
		_ = syscall.Kill(childPID, syscall.SIGKILL)
		cleanupErr := <-done
		t.Fatalf("Scan stayed alive after a progress error because a Mole child survived; cleanup returned %v", cleanupErr)
	}
	if err := waitForExit(childPID); err != nil {
		_ = syscall.Kill(childPID, syscall.SIGKILL)
		t.Fatalf("Mole child %d still exists after progress error: %v", childPID, err)
	}
}

func TestScannerCancellationStopsTheWholeMoleProcessGroup(t *testing.T) {
	home := t.TempDir()
	bundleDir := t.TempDir()
	fakeBundle(t, bundleDir)
	script := `#!/bin/sh
set -eu
sleep 30 &
child=$!
printf '%s\n' "$child" > "$HOME/child.pid"
wait "$child"
`
	if err := os.WriteFile(filepath.Join(bundleDir, MoPath), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	scanner := NewScanner(Bundle{dir: bundleDir}, home, slog.New(slog.NewTextHandler(io.Discard, nil)))
	go func() {
		_, err := scanner.Scan(ctx, nil)
		done <- err
	}()

	childPID := waitForChildPID(t, filepath.Join(home, "child.pid"))
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Scan error = %v, want context.Canceled", err)
		}
	case <-time.After(500 * time.Millisecond):
		_ = syscall.Kill(childPID, syscall.SIGKILL)
		cleanupErr := <-done
		t.Fatalf("Scan stayed alive after cancellation because a Mole child survived; cleanup returned %v", cleanupErr)
	}
	if err := waitForExit(childPID); err != nil {
		_ = syscall.Kill(childPID, syscall.SIGKILL)
		t.Fatalf("Mole child %d still exists after cancellation: %v", childPID, err)
	}
}

func TestScannerRunsTheBundledMoleWithInjectedHome(t *testing.T) {
	home := t.TempDir()
	cachePath := filepath.Join(home, "Library/Caches/Burrow/cache.data")
	writeTestFile(t, cachePath, "thirteen byte")
	whitelistPath := filepath.Join(home, ".config/mole/whitelist")
	writeTestFile(t, whitelistPath, "keep-this-entry\n")

	bundleDir := t.TempDir()
	fakeBundle(t, bundleDir)
	script := `#!/bin/sh
set -eu
test "$1" = clean
test "$2" = --dry-run
mkdir -p "$HOME/.config/mole"
printf '➤ App caches\n'
cat > "$HOME/.config/mole/clean-list.txt" <<EOF
=== App caches ===
$HOME/Library/Caches/Burrow/cache.data  # 999GB
EOF
`
	if err := os.WriteFile(filepath.Join(bundleDir, MoPath), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	var progress []clean.ScanProgress
	scanner := NewScanner(Bundle{dir: bundleDir}, home, slog.New(slog.NewTextHandler(io.Discard, nil)))
	result, err := scanner.Scan(context.Background(), func(update clean.ScanProgress) error {
		progress = append(progress, update)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Groups) != 1 || len(result.Groups[0].Items) != 1 {
		t.Fatalf("result = %#v, want one App Caches item", result)
	}
	item := result.Groups[0].Items[0]
	if result.Groups[0].ID != clean.AppCaches || item.Path != cachePath || item.Bytes != 13 {
		t.Fatalf("item = %#v in %s, want %s with 13 bytes", item, result.Groups[0].ID, cachePath)
	}
	if !slices.ContainsFunc(progress, func(update clean.ScanProgress) bool {
		return update.GroupID == clean.AppCaches && update.CurrentPath == cachePath
	}) {
		t.Fatalf("progress = %#v, want mapped group and current path", progress)
	}
	if !slices.ContainsFunc(progress, func(update clean.ScanProgress) bool {
		return update.GroupID == clean.AppCaches && update.GroupBytes == 13 && update.FoundBytes == 13 &&
			update.Fraction != nil && *update.Fraction == 1
	}) {
		t.Fatalf("progress = %#v, want final recomputed byte totals", progress)
	}
	whitelist, err := os.ReadFile(whitelistPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(whitelist) != "keep-this-entry\n" {
		t.Fatalf("whitelist changed to %q", whitelist)
	}
}

// Passwordless sudo would let `mo clean --dry-run` preview system paths
// outside the injected Home, which Burrow never cleans (ADR 0003).
func TestScannerDeniesMoleSudo(t *testing.T) {
	home := t.TempDir()
	bundleDir := t.TempDir()
	fakeBundle(t, bundleDir)
	script := `#!/bin/sh
set -eu
command -v sudo > "$HOME/sudo-path"
test "$(command -v sudo)" != /usr/bin/sudo
if sudo -n -v; then exit 1; fi
if sudo -n true; then exit 1; fi
mkdir -p "$HOME/.config/mole"
: > "$HOME/.config/mole/clean-list.txt"
`
	if err := os.WriteFile(filepath.Join(bundleDir, MoPath), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	scanner := NewScanner(Bundle{dir: bundleDir}, home, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if _, err := scanner.Scan(context.Background(), nil); err != nil {
		t.Fatalf("Mole reached a working sudo: %v", err)
	}
	shim, err := os.ReadFile(filepath.Join(home, "sudo-path"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(strings.TrimSpace(string(shim))); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("sudo shim %s outlived the Scan: %v", shim, err)
	}
}

func TestParseCleanListMapsSafeJunkAndMeasuresTheFilesystem(t *testing.T) {
	home := t.TempDir()
	if _, err := testhome.Generate(home); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		"Library/Caches/hash # café/cache.bin":                      "eleven bytes",
		"Library/Caches/Office/unknown.bin":                         "1234567",
		"Library/Caches/AppUtility/cache.bin":                       "utility",
		"Library/Caches/io.github.diikhanh.burrow/cache.data":       strings.Repeat("a", 4_096),
		"Library/Caches/Google/Chrome/Cache/browser.bin":            "browser",
		".Trash/section.data":                                       "section trash",
		"Library/Developer/Xcode/DerivedData/Burrow/Build/object.o": strings.Repeat("d", 5_120),
		"Library/Application Support/example/state.db":              "state",
		"Library/Application Support/OrphanedApp/cache.bin":         "leftover",
		"Library/Caches/com.apple.rosetta.update/update.bin":        "rosetta",
		"Library/iTunes/iPhone Software Updates/Burrow.ipsw":        strings.Repeat("f", 6_144),
		"Library/iTunes/iPhone Software Updates/covered.ipsw":       "covered",
		"Library/Application Support/MobileSync/Backup/backup.db":   "backup",
		"Library/Containers/com.docker.docker/Data/vms/0/data.bin":  "virtual",
		"Downloads/movie.mov":                                       "hidden",
		"Projects/Burrow/node_modules/cache.bin":                    "project",
		"Volumes/External/cache.bin":                                "external",
		"future.data":                                               "unknown",
	}
	for path, content := range files {
		writeTestFile(t, filepath.Join(home, filepath.FromSlash(path)), content)
	}

	golden, err := os.ReadFile("testdata/clean-list.txt")
	if err != nil {
		t.Fatal(err)
	}
	input := strings.ReplaceAll(string(golden), "{HOME}", home)
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))

	got, err := ParseCleanList(home, strings.NewReader(input), logger)
	if err != nil {
		t.Fatal(err)
	}

	want := map[string]map[string]int64{
		"app-caches": {
			filepath.Join(home, "Library/Caches/hash # café/cache.bin"):                12,
			filepath.Join(home, "Library/Caches/Office/unknown.bin"):                   7,
			filepath.Join(home, "Library/Caches/AppUtility/cache.bin"):                 7,
			filepath.Join(home, "Library/Caches/io.github.diikhanh.burrow/cache.data"): 4_096,
			filepath.Join(home, "Library/Caches/com.apple.rosetta.update/update.bin"):  7,
		},
		"browsers": {
			filepath.Join(home, "Library/Caches/Google/Chrome/Cache/browser.bin"): 7,
		},
		"logs-saved-state": {
			filepath.Join(home, "Library/Logs/Burrow/scan.log"):                 2_048,
			filepath.Join(home, "Library/Application Support/example/state.db"): 5,
		},
		"trash": {
			filepath.Join(home, ".Trash/old-download.data"): 3_072,
			filepath.Join(home, ".Trash/section.data"):      13,
		},
		"developer-tools": {
			filepath.Join(home, "Library/Developer/Xcode/DerivedData/Burrow/Build/object.o"): 5_120,
		},
		"virtualization": {
			filepath.Join(home, "Library/Containers/com.docker.docker/Data/vms/0/data.bin"): 7,
		},
		"app-leftovers": {
			filepath.Join(home, "Library/Application Support/OrphanedApp/cache.bin"): 8,
		},
		"device-firmware": {
			filepath.Join(home, "Library/iTunes/iPhone Software Updates/Burrow.ipsw"): 6_144,
		},
	}
	gotItems := make(map[string]map[string]int64)
	var firstIDs []string
	for _, group := range got.Groups {
		gotItems[string(group.ID)] = make(map[string]int64)
		for _, item := range group.Items {
			gotItems[string(group.ID)][item.Path] = item.Bytes
			firstIDs = append(firstIDs, string(group.ID)+":"+item.ID)
		}
	}
	if !mapsEqual(gotItems, want) {
		t.Fatalf("items = %#v, want %#v", gotItems, want)
	}
	wantPolicies := map[clean.JunkGroupID]struct {
		method   clean.RemovalMethod
		selected bool
	}{
		clean.AppCaches:      {method: clean.Delete, selected: true},
		clean.Browsers:       {method: clean.Delete, selected: true},
		clean.LogsSavedState: {method: clean.Delete, selected: true},
		clean.Trash:          {method: clean.Delete, selected: true},
		clean.DeveloperTools: {method: clean.Delete},
		clean.Virtualization: {method: clean.MoveToTrash},
		clean.AppLeftovers:   {method: clean.MoveToTrash, selected: true},
		clean.DeviceFirmware: {method: clean.MoveToTrash},
	}
	for _, group := range got.Groups {
		wantPolicy := wantPolicies[group.ID]
		if group.RemovalMethod != wantPolicy.method || group.DefaultSelected != wantPolicy.selected {
			t.Errorf("group %s policy = (%s, %t), want (%s, %t)", group.ID, group.RemovalMethod, group.DefaultSelected, wantPolicy.method, wantPolicy.selected)
		}
	}
	coveredSections := make(map[string]bool)
	for line := range strings.SplitSeq(input, "\n") {
		if match := sectionLine.FindStringSubmatch(line); match != nil {
			coveredSections[match[1]] = true
		}
	}
	for section := range sectionRules {
		if !coveredSections[section] {
			t.Errorf("golden clean-list does not cover Mole section %q", section)
		}
	}
	if !strings.Contains(logs.String(), `section="Future Mole section"`) {
		t.Fatalf("logs = %q, want unknown section", logs.String())
	}

	again, err := ParseCleanList(home, strings.NewReader(input), logger)
	if err != nil {
		t.Fatal(err)
	}
	var secondIDs []string
	for _, group := range again.Groups {
		for _, item := range group.Items {
			secondIDs = append(secondIDs, string(group.ID)+":"+item.ID)
		}
	}
	if strings.Join(firstIDs, "|") != strings.Join(secondIDs, "|") {
		t.Fatalf("ids changed between equal scans: %q != %q", firstIDs, secondIDs)
	}
}

// waitForExit waits until pid no longer exists. A killed orphan lingers as a
// zombie until launchd reaps it, so it can outlive Scan by a moment.
func waitForExit(pid int) error {
	deadline := time.Now().Add(2 * time.Second)
	for {
		err := syscall.Kill(pid, 0)
		if errors.Is(err, syscall.ESRCH) {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("still running at the deadline (kill 0: %w)", err)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// waitForChildPID waits for the fake Mole to record its child. The shell
// creates the file before writing it, so only a whole line is a pid. The
// deadline is generous because a loaded machine starts processes slowly.
func waitForChildPID(t *testing.T, path string) int {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		data, err := os.ReadFile(path)
		if err == nil && strings.HasSuffix(string(data), "\n") {
			pid, conversionErr := strconv.Atoi(strings.TrimSpace(string(data)))
			if conversionErr != nil {
				t.Fatal(conversionErr)
			}
			return pid
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("fake Mole did not start its child")
	return 0
}

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func mapsEqual(got, want map[string]map[string]int64) bool {
	if len(got) != len(want) {
		return false
	}
	for group, wantItems := range want {
		gotItems, ok := got[group]
		if !ok || len(gotItems) != len(wantItems) {
			return false
		}
		for path, size := range wantItems {
			if gotItems[path] != size {
				return false
			}
		}
	}
	return true
}
