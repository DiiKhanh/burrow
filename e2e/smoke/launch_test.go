//go:build smoke

// Package smoke runs the built Burrow.app. Build it first: `bun run build`.
package smoke

import (
	"context"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/mole"
	"github.com/DiiKhanh/burrow/internal/testhome"
)

const (
	app = "../../build/darwin-arm64/Burrow.app"
	// executable is the binary inside the app that `mygo build` makes on Apple Silicon.
	executable = app + "/Contents/MacOS/Burrow"
	resources  = app + "/Contents/Resources"
)

// settle is how long the app must keep running to count as started.
const settle = 5 * time.Second

func TestAppLaunches(t *testing.T) {
	app := startApp(t, generatedHome(t).Home, nil)

	select {
	case <-app.exited:
		t.Fatalf("the app exited after starting (%v):\n%s", app.err, app.output.String())
	case <-time.After(settle):
	}
}

func TestAppShipsMole(t *testing.T) {
	bundle, err := mole.Locate(resources)
	if err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{{bundle.Mo(), "--version"}, {bundle.Status(), "--json"}} {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, args[0], args[1:]...)
		cmd.Env = []string{"HOME=" + generatedHome(t).Home, "PATH=/usr/bin:/bin:/usr/sbin:/sbin", "TERM=dumb"}
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Errorf("%s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
}

// The app's own Scanner runs the bundled Mole, so the test covers the sudo
// shim that keeps a passwordless-sudo machine from previewing system paths.
func TestAppBundledMoleScansTheGeneratedHome(t *testing.T) {
	bundle, err := mole.Locate(resources)
	if err != nil {
		t.Fatal(err)
	}
	manifest := generatedHome(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	result, err := mole.NewScanner(bundle, manifest.Home, nil).Scan(ctx, nil)
	if err != nil {
		t.Fatalf("scanning the generated home: %v", err)
	}
	scanned := make(map[string]bool)
	for _, group := range result.Groups {
		for _, item := range group.Items {
			scanned[item.Path] = true
		}
	}
	for _, item := range manifest.Items {
		if !scanned[item.Path] {
			t.Errorf("Scan did not find generated fixture item %s", item.Path)
		}
	}
}

func generatedHome(t *testing.T) testhome.Manifest {
	t.Helper()
	manifest, err := testhome.Generate(filepath.Join(t.TempDir(), "home"))
	if err != nil {
		t.Fatal(err)
	}
	return manifest
}
