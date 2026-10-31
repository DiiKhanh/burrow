package mole

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"syscall"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/space"
)

// fakeAnalyzer installs script as the analyzer of a fake bundle.
func fakeAnalyzer(t *testing.T, script string) Bundle {
	t.Helper()
	dir := t.TempDir()
	fakeBundle(t, dir)
	if err := os.WriteFile(filepath.Join(dir, AnalyzePath), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return Bundle{dir: dir}
}

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestMeasurerTranslatesTheOverviewOfTheBundledAnalyzer(t *testing.T) {
	golden, err := filepath.Abs("testdata/analyze-overview.json")
	if err != nil {
		t.Fatal(err)
	}
	// The overview takes no path, and Mole finds Home's rows through HOME.
	bundle := fakeAnalyzer(t, `#!/bin/sh
set -eu
test "$#" -eq 1
test "$1" = --json
test "$HOME" = /Users/test
cat '`+golden+`'
`)
	measurer := NewMeasurer(bundle, "/Users/test", quietLogger())

	measurement, err := measurer.Measure(context.Background(), space.MeasureTarget{Kind: space.Overview})
	if err != nil {
		t.Fatal(err)
	}
	want := []space.MeasuredItem{
		{Name: "User Library", Path: "/Users/test/Library", Bytes: 73074991104, IsDir: true},
		{Name: "Home", Path: "/Users/test", Bytes: 46363366256, IsDir: true},
		{Name: "Docker Data", Path: "/Users/test/Library/Containers/com.docker.docker/Data", Bytes: 21561749504, IsDir: true, Insight: true},
		{Name: "Applications", Path: "/Applications", Bytes: 19704082432, IsDir: true},
		{Name: "System Library", Path: "/Library", Bytes: 6834159616, IsDir: true},
		{Name: "Xcode Simulators", Path: "/Users/test/Library/Developer/CoreSimulator/Devices", Bytes: 3065757696, IsDir: true, Insight: true},
		{Name: "Old Downloads (90d+)", Path: "/Users/test/Downloads", Bytes: 3017911401, IsDir: true, Insight: true},
		{Name: "Homebrew Cache", Path: "/Users/test/Library/Caches/Homebrew", Bytes: 181170176, IsDir: true, Insight: true},
		{Name: "System Logs", Path: "/Users/test/Library/Logs", Bytes: 2109440, IsDir: true, Insight: true},
	}
	if !slices.Equal(measurement.Items, want) {
		t.Errorf("items = %#v, want %#v", measurement.Items, want)
	}
}

func TestMeasurerTranslatesAFolderOfTheBundledAnalyzer(t *testing.T) {
	golden, err := filepath.Abs("testdata/analyze-folder.json")
	if err != nil {
		t.Fatal(err)
	}
	// The folder is one argument, however odd its name.
	bundle := fakeAnalyzer(t, `#!/bin/sh
set -eu
test "$#" -eq 2
test "$1" = --json
test "$2" = '/Users/test/Projects'
test "$HOME" = /Users/test
cat '`+golden+`'
`)
	measurer := NewMeasurer(bundle, "/Users/test", quietLogger())

	measurement, err := measurer.Measure(context.Background(), space.MeasureTarget{Kind: space.Folder, Path: "/Users/test/Projects"})
	if err != nil {
		t.Fatal(err)
	}
	// Mole names a symlink "<name> →"; it is a link, not a folder to open,
	// even when it points at one. A folder whose own name ends in " →"
	// keeps it.
	want := []space.MeasuredItem{
		{Name: "app", Path: "/Users/test/Projects/app", Bytes: 3002368, IsDir: true},
		{Name: "node_modules", Path: "/Users/test/Projects/node_modules", Bytes: 2400000, IsDir: true, Regenerable: true},
		{Name: "Ảnh chụp", Path: "/Users/test/Projects/Ảnh chụp", Bytes: 1500000, IsDir: true},
		{Name: "real", Path: "/Users/test/Projects/real", Bytes: 500000, IsDir: true},
		{Name: `quote"and'apostrophe.txt`, Path: `/Users/test/Projects/quote"and'apostrophe.txt`, Bytes: 12000},
		{Name: "Drafts →", Path: "/Users/test/Projects/Drafts →", Bytes: 9000, IsDir: true},
		{Name: "emoji 📦", Path: "/Users/test/Projects/emoji 📦", Bytes: 700, IsDir: true},
		{Name: "data link", Path: "/Users/test/Projects/data link"},
		{Name: "shortcut", Path: "/Users/test/Projects/shortcut"},
	}
	if !slices.Equal(measurement.Items, want) {
		t.Errorf("items = %#v, want %#v", measurement.Items, want)
	}
	wantFiles := []space.MeasuredItem{
		{Name: "app.dmg", Path: "/Users/test/Projects/app/build/app.dmg", Bytes: 2900000},
		{Name: "IMG 0001.heic", Path: "/Users/test/Projects/Ảnh chụp/IMG 0001.heic", Bytes: 1500000},
	}
	if !slices.Equal(measurement.LargestFiles, wantFiles) {
		t.Errorf("largest files = %#v, want %#v", measurement.LargestFiles, wantFiles)
	}
}

func TestMeasurerRefusesOutputItCannotTrust(t *testing.T) {
	folder := space.MeasureTarget{Kind: space.Folder, Path: "/Users/test/Projects"}
	tests := []struct {
		name   string
		target space.MeasureTarget
		output string
	}{
		{name: "not JSON", target: space.MeasureTarget{Kind: space.Overview}, output: `Measuring...`},
		{name: "a folder instead of the overview", target: space.MeasureTarget{Kind: space.Overview}, output: `{"overview": false, "path": "/", "entries": []}`},
		{name: "the overview instead of a folder", target: folder, output: `{"overview": true, "path": "/", "entries": []}`},
		{name: "another folder", target: folder, output: `{"overview": false, "path": "/Users/test", "entries": []}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			bundle := fakeAnalyzer(t, "#!/bin/sh\ncat <<'EOF'\n"+test.output+"\nEOF\n")
			measurer := NewMeasurer(bundle, "/Users/test", quietLogger())

			_, err := measurer.Measure(context.Background(), test.target)
			if err == nil {
				t.Fatal("Measure trusted the output, want an error")
			}
		})
	}
}

// One row Mole got wrong costs that row, not the whole Measure.
func TestMeasurerLeavesOutItemsItCannotTrust(t *testing.T) {
	bundle := fakeAnalyzer(t, `#!/bin/sh
cat <<'EOF'
{"overview": true, "entries": [
  {"name": "Relative", "path": "Users/test", "size": 1, "is_dir": true},
  {"name": "Climbs", "path": "/Users/test/../other", "size": 1, "is_dir": true},
  {"name": "Negative", "path": "/Users/test/Library", "size": -1, "is_dir": true},
  {"name": "", "path": "/Users/test/Nameless", "size": 1, "is_dir": true},
  {"name": "Applications", "path": "/Applications", "size": 7, "is_dir": true}
]}
EOF
`)
	measurer := NewMeasurer(bundle, "/Users/test", quietLogger())

	measurement, err := measurer.Measure(context.Background(), space.MeasureTarget{Kind: space.Overview})
	if err != nil {
		t.Fatal(err)
	}
	want := []space.MeasuredItem{{Name: "Applications", Path: "/Applications", Bytes: 7, IsDir: true}}
	if !slices.Equal(measurement.Items, want) {
		t.Errorf("items = %#v, want %#v", measurement.Items, want)
	}
}

// A folder's rows are what lies directly in it; anything else is a row
// Mole got wrong.
func TestMeasurerLeavesOutFolderItemsOutsideTheFolder(t *testing.T) {
	bundle := fakeAnalyzer(t, `#!/bin/sh
cat <<'EOF'
{"overview": false, "path": "/Users/test/Projects", "entries": [
  {"name": "app", "path": "/Users/test/Projects/app", "size": 7, "is_dir": true},
  {"name": "deeper", "path": "/Users/test/Projects/app/deeper", "size": 1, "is_dir": true},
  {"name": "Projects", "path": "/Users/test/Projects", "size": 1, "is_dir": true},
  {"name": "elsewhere", "path": "/Users/test/elsewhere", "size": 1, "is_dir": true}
]}
EOF
`)
	measurer := NewMeasurer(bundle, "/Users/test", quietLogger())

	measurement, err := measurer.Measure(context.Background(), space.MeasureTarget{Kind: space.Folder, Path: "/Users/test/Projects"})
	if err != nil {
		t.Fatal(err)
	}
	want := []space.MeasuredItem{{Name: "app", Path: "/Users/test/Projects/app", Bytes: 7, IsDir: true}}
	if !slices.Equal(measurement.Items, want) {
		t.Errorf("items = %#v, want %#v", measurement.Items, want)
	}
}

// Mole may find a folder's largest files through Spotlight: one that is
// not below the folder, or that Burrow cannot trust, is left out.
func TestMeasurerLeavesOutLargestFilesOutsideTheFolder(t *testing.T) {
	bundle := fakeAnalyzer(t, `#!/bin/sh
cat <<'EOF'
{"overview": false, "path": "/Users/test/Projects", "entries": [], "large_files": [
  {"name": "deep.iso", "path": "/Users/test/Projects/app/deep.iso", "size": 9},
  {"name": "elsewhere.iso", "path": "/Users/test/elsewhere.iso", "size": 8},
  {"name": "sibling.iso", "path": "/Users/test/Projects2/sibling.iso", "size": 8},
  {"name": "Projects", "path": "/Users/test/Projects", "size": 8},
  {"name": "climbs.iso", "path": "/Users/test/Projects/../climbs.iso", "size": 8},
  {"name": "negative.iso", "path": "/Users/test/Projects/negative.iso", "size": -1},
  {"name": "top.iso", "path": "/Users/test/Projects/top.iso", "size": 7}
]}
EOF
`)
	measurer := NewMeasurer(bundle, "/Users/test", quietLogger())

	measurement, err := measurer.Measure(context.Background(), space.MeasureTarget{Kind: space.Folder, Path: "/Users/test/Projects"})
	if err != nil {
		t.Fatal(err)
	}
	want := []space.MeasuredItem{
		{Name: "deep.iso", Path: "/Users/test/Projects/app/deep.iso", Bytes: 9},
		{Name: "top.iso", Path: "/Users/test/Projects/top.iso", Bytes: 7},
	}
	if !slices.Equal(measurement.LargestFiles, want) {
		t.Errorf("largest files = %#v, want %#v", measurement.LargestFiles, want)
	}
}

// Mole marks regenerable folders in the overview too, such as an Insight
// named DerivedData. The overview has no largest files.
func TestMeasurerTranslatesRegenerableOverviewRows(t *testing.T) {
	bundle := fakeAnalyzer(t, `#!/bin/sh
cat <<'EOF'
{"overview": true, "path": "/", "entries": [
  {"name": "Xcode DerivedData", "path": "/Users/test/Library/Developer/Xcode/DerivedData", "size": 5, "is_dir": true, "insight": true, "cleanable": true}
], "large_files": [
  {"name": "big.iso", "path": "/Users/test/big.iso", "size": 9}
]}
EOF
`)
	measurer := NewMeasurer(bundle, "/Users/test", quietLogger())

	measurement, err := measurer.Measure(context.Background(), space.MeasureTarget{Kind: space.Overview})
	if err != nil {
		t.Fatal(err)
	}
	want := []space.MeasuredItem{
		{Name: "Xcode DerivedData", Path: "/Users/test/Library/Developer/Xcode/DerivedData", Bytes: 5, IsDir: true, Insight: true, Regenerable: true},
	}
	if !slices.Equal(measurement.Items, want) {
		t.Errorf("items = %#v, want %#v", measurement.Items, want)
	}
	if measurement.LargestFiles != nil {
		t.Errorf("largest files = %#v, want none for the overview", measurement.LargestFiles)
	}
}

func TestMeasurerReportsAnAnalyzerThatFails(t *testing.T) {
	bundle := fakeAnalyzer(t, "#!/bin/sh\necho 'failed to scan directory' >&2\nexit 1\n")
	measurer := NewMeasurer(bundle, "/Users/test", quietLogger())

	_, err := measurer.Measure(context.Background(), space.MeasureTarget{Kind: space.Overview})
	if err == nil {
		t.Fatal("Measure succeeded, want the analyzer's failure")
	}
}

func TestMeasurerCancellationStopsTheWholeAnalyzerProcessGroup(t *testing.T) {
	home := t.TempDir()
	bundle := fakeAnalyzer(t, `#!/bin/sh
set -eu
sleep 30 &
child=$!
printf '%s\n' "$child" > "$HOME/child.pid"
wait "$child"
`)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	measurer := NewMeasurer(bundle, home, quietLogger())
	go func() {
		_, err := measurer.Measure(ctx, space.MeasureTarget{Kind: space.Overview})
		done <- err
	}()

	childPID := waitForChildPID(t, filepath.Join(home, "child.pid"))
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Measure error = %v, want context.Canceled", err)
		}
	case <-time.After(500 * time.Millisecond):
		_ = syscall.Kill(childPID, syscall.SIGKILL)
		cleanupErr := <-done
		t.Fatalf("Measure stayed alive after cancellation because an analyzer child survived; cleanup returned %v", cleanupErr)
	}
	if err := waitForExit(childPID); err != nil {
		_ = syscall.Kill(childPID, syscall.SIGKILL)
		t.Fatalf("analyzer child %d still exists after cancellation: %v", childPID, err)
	}
}
