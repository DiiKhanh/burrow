package automation_test

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/automation"
)

// connect serves eval on one end of a pair of pipes and returns a Client on
// the other, and the error Serve ends with.
func connect(t *testing.T, eval automation.Eval) (*automation.Client, func() error) {
	t.Helper()
	requestsR, requestsW := io.Pipe()
	responsesR, responsesW := io.Pipe()
	served := make(chan error, 1)
	go func() {
		err := automation.Serve(context.Background(), requestsR, responsesW, eval)
		_ = responsesW.Close()
		served <- err
	}()
	t.Cleanup(func() { _ = requestsW.Close() })
	stop := func() error {
		_ = requestsW.Close()
		select {
		case err := <-served:
			return err
		case <-time.After(5 * time.Second):
			t.Fatal("Serve did not stop after the requests ended")
			return nil
		}
	}
	return automation.NewClient(responsesR, requestsW), stop
}

func TestClientGetsTheValueOfTheScript(t *testing.T) {
	client, _ := connect(t, func(_ context.Context, script string) (any, error) {
		if script != "document.title" {
			return nil, errors.New("unexpected script " + script)
		}
		return map[string]any{"title": "Burrow", "groups": []any{"trash"}}, nil
	})

	raw, err := client.Eval(context.Background(), "document.title")
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Title  string   `json:"title"`
		Groups []string `json:"groups"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("value %s: %v", raw, err)
	}
	if got.Title != "Burrow" || strings.Join(got.Groups, ",") != "trash" {
		t.Fatalf("value = %+v, want title Burrow and groups [trash]", got)
	}
}

func TestClientReportsAScriptThatThrowsAndRunsTheNextOne(t *testing.T) {
	client, _ := connect(t, func(_ context.Context, script string) (any, error) {
		if script == "throw" {
			return nil, errors.New("mygo: javascript error: no Start scan button")
		}
		return true, nil
	})

	if _, err := client.Eval(context.Background(), "throw"); err == nil || !strings.Contains(err.Error(), "no Start scan button") {
		t.Fatalf("Eval(throw) error = %v, want the script's message", err)
	}
	raw, err := client.Eval(context.Background(), "next")
	if err != nil || string(raw) != "true" {
		t.Fatalf("Eval(next) = %s, %v; want true", raw, err)
	}
}

func TestServeEndsWhenTheLauncherClosesTheRequests(t *testing.T) {
	_, stop := connect(t, func(context.Context, string) (any, error) { return nil, nil })

	if err := stop(); err != nil {
		t.Fatalf("Serve = %v, want nil once the requests end", err)
	}
}

func TestClientFailsOnceTheAppIsGone(t *testing.T) {
	requestsR, requestsW := io.Pipe()
	responsesR, responsesW := io.Pipe()
	go func() {
		// The app reads one script and quits without answering.
		_, _ = bufio.NewReader(requestsR).ReadString('\n')
		_ = responsesW.Close()
	}()
	client := automation.NewClient(responsesR, requestsW)

	if _, err := client.Eval(context.Background(), "1"); !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("Eval error = %v, want io.ErrUnexpectedEOF", err)
	}
}

func TestClientRefusesScriptsAfterAbandoningOne(t *testing.T) {
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	client, _ := connect(t, func(context.Context, string) (any, error) {
		<-release
		return 1, nil
	})
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	if _, err := client.Eval(ctx, "slow"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Eval(slow) error = %v, want the deadline", err)
	}
	if _, err := client.Eval(context.Background(), "next"); !errors.Is(err, automation.ErrBroken) {
		t.Fatalf("Eval(next) error = %v, want ErrBroken", err)
	}
}
