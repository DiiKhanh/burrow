//go:build integration

package mole

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/testhome"
)

func TestIntegrationBundledMoScansTheGeneratedHome(t *testing.T) {
	home := t.TempDir()
	if _, err := testhome.Generate(home); err != nil {
		t.Fatal(err)
	}
	var logs bytes.Buffer
	adapter := NewScanner(bundled(t), home, slog.New(slog.NewTextHandler(&logs, nil)))
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	result, err := adapter.Scan(ctx, nil)
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
	want := map[string]struct {
		group clean.JunkGroupID
		bytes int64
	}{
		filepath.Join(home, "Library/Caches/io.github.diikhanh.burrow"): {
			group: clean.LogsSavedState,
			bytes: 4_096,
		},
		filepath.Join(home, "Library/Logs/Burrow"): {
			group: clean.LogsSavedState,
			bytes: 2_048,
		},
		filepath.Join(home, ".Trash/old-download.data"): {
			group: clean.Trash,
			bytes: 3_072,
		},
		filepath.Join(home, "Library/Developer/Xcode/DerivedData/Burrow"): {
			group: clean.DeveloperTools,
			bytes: 5_120,
		},
	}
	if len(got) != len(want) {
		t.Fatalf("Scan returned %#v, want %#v", got, want)
	}
	for path, expected := range want {
		if got[path] != expected {
			t.Errorf("Scan item %s = %#v, want %#v", path, got[path], expected)
		}
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
