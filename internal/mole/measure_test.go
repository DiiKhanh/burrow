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

func TestMeasurerRefusesOutputItCannotTrust(t *testing.T) {
	tests := []struct {
		name   string
		output string
	}{
		{name: "not JSON", output: `Measuring...`},
		{name: "a folder instead of the overview", output: `{"overview": false, "entries": []}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			bundle := fakeAnalyzer(t, "#!/bin/sh\ncat <<'EOF'\n"+test.output+"\nEOF\n")
			measurer := NewMeasurer(bundle, "/Users/test", quietLogger())

			_, err := measurer.Measure(context.Background(), space.MeasureTarget{Kind: space.Overview})
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
