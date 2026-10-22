package mole

import (
	"bytes"
	"context"
	"errors"
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
)

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

	pidPath := filepath.Join(home, "child.pid")
	var childPID int
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		data, err := os.ReadFile(pidPath)
		if err == nil {
			childPID, err = strconv.Atoi(strings.TrimSpace(string(data)))
			if err != nil {
				t.Fatal(err)
			}
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if childPID == 0 {
		t.Fatal("fake Mole did not start its child")
	}
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Scan error = %v, want context.Canceled", err)
		}
	case <-time.After(500 * time.Millisecond):
		_ = syscall.Kill(childPID, syscall.SIGKILL)
		<-done
		t.Fatal("Scan stayed alive after cancellation because a Mole child survived")
	}
	if err := syscall.Kill(childPID, 0); !errors.Is(err, syscall.ESRCH) {
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
printf 'measuring %s\n' "$HOME/Library/Caches/Burrow/cache.data"
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

func TestParseCleanListMapsSafeJunkAndMeasuresTheFilesystem(t *testing.T) {
	home := t.TempDir()
	files := map[string]string{
		"Library/Caches/hash # café/cache.bin":                    "eleven bytes",
		"Library/Caches/Office/unknown.bin":                       "1234567",
		"Library/Logs/Burrow/session.log":                         "log",
		".Trash/old.data":                                         "trash",
		"Library/Application Support/example/state.db":            "state",
		"Library/Caches/com.apple.rosetta.update/update.bin":      "rosetta",
		"Library/iTunes/iPhone Software Updates/device.ipsw":      "firmware",
		"Library/iTunes/iPhone Software Updates/covered.ipsw":     "covered",
		"Library/Application Support/MobileSync/Backup/backup.db": "backup",
		"Downloads/movie.mov":                                     "hidden",
		"future.data":                                             "unknown",
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
			filepath.Join(home, "Library/Caches/hash # café/cache.bin"):               12,
			filepath.Join(home, "Library/Caches/Office/unknown.bin"):                  7,
			filepath.Join(home, "Library/Caches/com.apple.rosetta.update/update.bin"): 7,
		},
		"logs-saved-state": {
			filepath.Join(home, "Library/Logs/Burrow/session.log"):              3,
			filepath.Join(home, "Library/Application Support/example/state.db"): 5,
		},
		"trash": {
			filepath.Join(home, ".Trash/old.data"): 5,
		},
		"device-firmware": {
			filepath.Join(home, "Library/iTunes/iPhone Software Updates/device.ipsw"): 8,
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
