//go:build smoke

// Package smoke runs the built Burrow.app. Build it first: `bun run build`.
package smoke

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/mole"
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
	path, err := filepath.Abs(executable)
	if err != nil {
		t.Fatalf("resolving %s: %v", executable, err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("the app is not built, run `bun run build` first: %v", err)
	}

	var output bytes.Buffer
	cmd := exec.Command(path)
	cmd.Env = append(os.Environ(), "HOME="+t.TempDir())
	cmd.Stdout = &output
	cmd.Stderr = &output
	if err := cmd.Start(); err != nil {
		t.Fatalf("starting the app: %v", err)
	}
	var waitErr error
	exited := make(chan struct{})
	go func() {
		waitErr = cmd.Wait()
		close(exited)
	}()

	select {
	case <-exited:
		t.Fatalf("the app exited after starting (%v):\n%s", waitErr, output.String())
	case <-time.After(settle):
	}

	if err := cmd.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		t.Fatalf("stopping the app: %v", err)
	}
	<-exited
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
		cmd.Env = []string{"HOME=" + t.TempDir(), "PATH=/usr/bin:/bin:/usr/sbin:/sbin", "TERM=dumb"}
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Errorf("%s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
}
