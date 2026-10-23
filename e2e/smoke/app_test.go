//go:build smoke

package smoke

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/automation"
)

// quitGrace is how long the app may take to quit once its automation pipe closes.
const quitGrace = 10 * time.Second

// runningApp is the built app, started with HOME set to a fixture tree.
type runningApp struct {
	cmd    *exec.Cmd
	output *lockedBuffer
	exited chan struct{}
	err    error
}

// startApp launches the built app with HOME=home. extraFiles become the
// app's file descriptors 3, 4 and so on.
func startApp(t *testing.T, home string, env []string, extraFiles ...*os.File) *runningApp {
	t.Helper()
	path, err := filepath.Abs(executable)
	if err != nil {
		t.Fatalf("resolving %s: %v", executable, err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("the app is not built, run `bun run build` first: %v", err)
	}
	app := &runningApp{output: &lockedBuffer{}, exited: make(chan struct{})}
	app.cmd = exec.Command(path)
	app.cmd.Env = append(append(os.Environ(), "HOME="+home), env...)
	app.cmd.Stdout = app.output
	app.cmd.Stderr = app.output
	app.cmd.ExtraFiles = extraFiles
	if err := app.cmd.Start(); err != nil {
		t.Fatalf("starting the app: %v", err)
	}
	go func() {
		app.err = app.cmd.Wait()
		close(app.exited)
	}()
	t.Cleanup(func() {
		app.kill(t)
		if t.Failed() {
			t.Logf("app output:\n%s", app.output.String())
		}
	})
	return app
}

// kill stops the app if it still runs.
func (a *runningApp) kill(t *testing.T) {
	t.Helper()
	if err := a.cmd.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		t.Errorf("stopping the app: %v", err)
	}
	<-a.exited
}

// startDrivenApp launches the built app with HOME=home and returns a page
// that runs scripts in it through the automation pipes. Closing them at the
// end of the test makes the app quit.
func startDrivenApp(t *testing.T, home string) *page {
	t.Helper()
	requestsR, requestsW, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	responsesR, responsesW, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	app := startApp(t, home, []string{automation.Env + "=1"}, requestsR, responsesW)
	// Only the app keeps its ends, so either side sees the other one go.
	for _, f := range []*os.File{requestsR, responsesW} {
		if err := f.Close(); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		_ = requestsW.Close()
		select {
		case <-app.exited:
		case <-time.After(quitGrace):
			t.Errorf("the app kept running %s after its automation pipe closed", quitGrace)
		}
		_ = responsesR.Close()
	})
	return &page{t: t, app: app, client: automation.NewClient(responsesR, requestsW)}
}

// page is the app's web page, driven with Page.Eval.
type page struct {
	t      *testing.T
	app    *runningApp
	client *automation.Client
}

// evalTimeout bounds one script: none of them waits on the app.
const evalTimeout = 30 * time.Second

// eval runs script, formatted with args encoded as JSON, and decodes its
// value into out.
func (p *page) eval(out any, script string, args ...any) {
	p.t.Helper()
	raw, err := p.run(script, args...)
	if err != nil {
		p.t.Fatal(err)
	}
	if err := json.Unmarshal(raw, out); err != nil {
		p.t.Fatalf("decoding %s: %v", raw, err)
	}
}

// waitFor runs script every pollInterval until it returns something other
// than null or false, decodes that into out, and fails after timeout.
func (p *page) waitFor(what string, timeout time.Duration, out any, script string, args ...any) {
	p.t.Helper()
	deadline := time.Now().Add(timeout)
	var lastErr error
	for {
		raw, err := p.run(script, args...)
		switch {
		case errors.Is(err, automation.ErrBroken), errors.Is(err, context.DeadlineExceeded):
			p.t.Fatalf("waiting for %s: %v", what, err)
		case err != nil:
			// The page may still be loading.
			lastErr = err
		case string(raw) != "null" && string(raw) != "false":
			if err := json.Unmarshal(raw, out); err != nil {
				p.t.Fatalf("waiting for %s: decoding %s: %v", what, raw, err)
			}
			return
		}
		select {
		case <-p.app.exited:
			p.t.Fatalf("the app exited while waiting for %s (%v)", what, p.app.err)
		case <-time.After(pollInterval):
		}
		if time.Now().After(deadline) {
			p.t.Fatalf("%s did not happen within %s (last error: %v)", what, timeout, lastErr)
		}
	}
}

const pollInterval = 250 * time.Millisecond

func (p *page) run(script string, args ...any) (json.RawMessage, error) {
	encoded := make([]any, len(args))
	for i, arg := range args {
		raw, err := json.Marshal(arg)
		if err != nil {
			return nil, fmt.Errorf("encoding script argument %v: %w", arg, err)
		}
		encoded[i] = string(raw)
	}
	ctx, cancel := context.WithTimeout(context.Background(), evalTimeout)
	defer cancel()
	return p.client.Eval(ctx, fmt.Sprintf(script, encoded...))
}

// lockedBuffer collects the app's output from two pipes at once.
type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}
