//go:build integration

package mole

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

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
