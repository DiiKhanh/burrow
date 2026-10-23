package clean_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/clean/cleantest"
)

func TestEngineReleasesTheScanSlotAfterCancellation(t *testing.T) {
	started := make(chan struct{})
	var calls atomic.Int32
	adapter := scannerFunc(func(ctx context.Context, _ func(clean.ScanProgress) error) (clean.ScanResult, error) {
		if calls.Add(1) == 1 {
			close(started)
			<-ctx.Done()
			return clean.ScanResult{}, ctx.Err()
		}
		return clean.ScanResult{Groups: []clean.JunkGroup{{ID: clean.Trash}}}, nil
	})
	engine := clean.NewEngine(clean.Options{Scanner: adapter, Processes: cleantest.NewFakeProcesses()})
	ctx, cancel := context.WithCancel(context.Background())
	firstDone := make(chan error, 1)
	go func() {
		_, err := engine.Scan(ctx, nil)
		firstDone <- err
	}()
	<-started
	cancel()
	if err := <-firstDone; !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled Scan error = %v, want context.Canceled", err)
	}

	result, err := engine.Scan(context.Background(), nil)
	if err != nil {
		t.Fatalf("Scan after cancellation = %v", err)
	}
	if len(result.Groups) != 1 || result.Groups[0].ID != clean.Trash {
		t.Fatalf("Scan after cancellation result = %#v", result)
	}
}

func TestEngineRejectsASecondScanWhileOneIsRunning(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	adapter := scannerFunc(func(context.Context, func(clean.ScanProgress) error) (clean.ScanResult, error) {
		close(started)
		<-release
		return clean.ScanResult{}, nil
	})
	engine := clean.NewEngine(clean.Options{Scanner: adapter, Processes: cleantest.NewFakeProcesses()})
	firstDone := make(chan error, 1)
	go func() {
		_, err := engine.Scan(context.Background(), nil)
		firstDone <- err
	}()
	<-started

	_, err := engine.Scan(context.Background(), nil)
	if !errors.Is(err, clean.ErrBusy) {
		t.Fatalf("second Scan error = %v, want ErrBusy", err)
	}
	close(release)
	if err := <-firstDone; err != nil {
		t.Fatalf("first Scan error = %v", err)
	}
}

type scannerFunc func(context.Context, func(clean.ScanProgress) error) (clean.ScanResult, error)

func (f scannerFunc) Scan(ctx context.Context, send func(clean.ScanProgress) error) (clean.ScanResult, error) {
	return f(ctx, send)
}

func TestEngineScanForwardsProgressAndResult(t *testing.T) {
	wantProgress := clean.ScanProgress{GroupID: clean.AppCaches, FoundBytes: 42}
	wantResult := clean.ScanResult{Groups: []clean.JunkGroup{{
		ID:    clean.AppCaches,
		Items: []clean.JunkItem{{ID: "stable", Path: "/tmp/home/cache", Bytes: 42}},
	}}}
	adapter := scannerFunc(func(_ context.Context, send func(clean.ScanProgress) error) (clean.ScanResult, error) {
		if err := send(wantProgress); err != nil {
			return clean.ScanResult{}, err
		}
		return wantResult, nil
	})
	engine := clean.NewEngine(clean.Options{Scanner: adapter, Processes: cleantest.NewFakeProcesses()})
	var gotProgress []clean.ScanProgress

	gotResult, err := engine.Scan(context.Background(), func(progress clean.ScanProgress) error {
		gotProgress = append(gotProgress, progress)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(gotProgress) != 1 || gotProgress[0] != wantProgress {
		t.Fatalf("progress = %#v, want %#v", gotProgress, wantProgress)
	}
	if len(gotResult.Groups) != 1 || gotResult.Groups[0].ID != clean.AppCaches ||
		len(gotResult.Groups[0].Items) != 1 || gotResult.Groups[0].Items[0].ID != "stable" {
		t.Fatalf("result = %#v, want %#v", gotResult, wantResult)
	}
}
