//go:build integration

package mole

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/testhome"
)

func TestIntegrationBundledMoScansTheGeneratedHome(t *testing.T) {
	home := t.TempDir()
	manifest, err := testhome.Generate(home)
	if err != nil {
		t.Fatal(err)
	}
	var logs bytes.Buffer
	adapter := NewScanner(bundled(t), home, slog.New(slog.NewTextHandler(&logs, nil)))
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	var progress []clean.ScanProgress
	result, err := adapter.Scan(ctx, func(update clean.ScanProgress) error {
		progress = append(progress, update)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	got := make(map[string]struct {
		group clean.JunkGroupID
		bytes int64
	})
	for _, group := range result.Groups {
		for _, item := range group.Items {
			got[item.Path] = struct {
				group clean.JunkGroupID
				bytes int64
			}{group: group.ID, bytes: item.Bytes}
		}
	}
	want := make(map[string]struct {
		group clean.JunkGroupID
		bytes int64
	}, len(manifest.Items))
	for _, item := range manifest.Items {
		want[item.Path] = struct {
			group clean.JunkGroupID
			bytes int64
		}{group: item.GroupID, bytes: item.Bytes}
	}
	if len(got) != len(want) {
		t.Fatalf("Scan returned %#v, want %#v", got, want)
	}
	for path, expected := range want {
		if got[path] != expected {
			t.Errorf("Scan item %s = %#v, want %#v", path, got[path], expected)
		}
		if !slices.ContainsFunc(progress, func(update clean.ScanProgress) bool {
			return update.CurrentPath == path
		}) {
			t.Errorf("Scan progress never reported generated fixture path %s", path)
		}
	}
	var maxFound int64
	for _, update := range progress {
		if update.FoundBytes < maxFound {
			t.Errorf("live found total decreased from %d to %d", maxFound, update.FoundBytes)
		}
		if update.FoundBytes > maxFound {
			maxFound = update.FoundBytes
		}
	}
	var wantFound int64
	for _, item := range manifest.Items {
		wantFound += item.Bytes
	}
	if maxFound != wantFound {
		t.Errorf("largest live found total = %d, want %d", maxFound, wantFound)
	}
	if strings.Contains(logs.String(), "unknown Mole section") {
		t.Fatalf("pinned Mole emitted an unmapped section:\n%s", logs.String())
	}
}

// The bundle that `bun run fetch:mole` installed into the project.
const projectResources = "../../resources"

func bundled(t *testing.T) Bundle {
	t.Helper()
	b, err := Locate(projectResources)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// pinnedVersion reads the version mole.lock pins, without its "V".
func pinnedVersion(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile("../../mole.lock")
	if err != nil {
		t.Fatal(err)
	}
	var lock struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(data, &lock); err != nil {
		t.Fatal(err)
	}
	return strings.TrimPrefix(lock.Version, "V")
}

// command runs a bundled program with a fake HOME and no PATH to any `mo`
// the machine has.
func command(t *testing.T, path string, args ...string) *exec.Cmd {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	t.Cleanup(cancel)
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = []string{"HOME=" + t.TempDir(), "PATH=/usr/bin:/bin:/usr/sbin:/sbin", "TERM=dumb"}
	return cmd
}

func TestIntegrationBundledMoRunsThePinnedVersion(t *testing.T) {
	out, err := command(t, bundled(t).Mo(), "--version").CombinedOutput()
	if err != nil {
		t.Fatalf("mo --version: %v\n%s", err, out)
	}
	if want := pinnedVersion(t); !strings.Contains(string(out), want) {
		t.Errorf("mo --version printed %q, want version %s", out, want)
	}
}

func TestIntegrationBundledStatusPrintsMetrics(t *testing.T) {
	out, err := command(t, bundled(t).Status(), "--json").Output()
	if err != nil {
		t.Fatalf("status --json: %v\n%s", err, out)
	}
	var metrics map[string]any
	if err := json.Unmarshal(out, &metrics); err != nil {
		t.Fatalf("status --json printed no JSON object: %v\n%.500s", err, out)
	}
	if len(metrics) == 0 {
		t.Error("status --json printed an empty object")
	}
}

// A Trash Mole cannot list stands in for one macOS hides without Full Disk
// Access: the bundled Mole says so in the words the adapter reads.
func TestIntegrationBundledMoReportsAnUnlistableTrash(t *testing.T) {
	home := t.TempDir()
	trash := filepath.Join(home, ".Trash")
	if err := os.Mkdir(trash, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(trash, 0o755) })
	adapter := NewScanner(bundled(t), home, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	result, err := adapter.Scan(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(result.Unreadable, []clean.JunkGroupID{clean.Trash}) {
		t.Fatalf("unreadable = %v, want [trash]", result.Unreadable)
	}
}
