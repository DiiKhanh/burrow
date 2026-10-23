package engine

import (
	"context"
	"sync"
)

// StatusWatcher runs WatchStatus between Start and Stop. The app starts it
// while Burrow's window is shown and stops it when the window hides,
// minimizes or closes. History starts again on every Start.
type StatusWatcher struct {
	source StatusSource
	sleep  Sleep
	emit   func(Snapshot)

	mu     sync.Mutex
	run    uint64 // counts Starts and Stops; samples of an older run are dropped
	cancel context.CancelFunc
	// exited closes once the latest run's collector is gone.
	exited chan struct{}

	// emitting keeps snapshots in order across runs: an older run finishes
	// sending before the next one starts.
	emitting sync.Mutex
}

// NewStatusWatcher returns a stopped watcher that sends snapshots of source
// to emit once started.
func NewStatusWatcher(source StatusSource, emit func(Snapshot)) *StatusWatcher {
	return newStatusWatcher(source, sleepContext, emit)
}

func newStatusWatcher(source StatusSource, sleep Sleep, emit func(Snapshot)) *StatusWatcher {
	exited := make(chan struct{})
	close(exited)
	return &StatusWatcher{source: source, sleep: sleep, emit: emit, exited: exited}
}

// Start collects, unless it already does. WatchStatus restarts a collector
// that stops on its own until Stop.
func (w *StatusWatcher) Start() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.cancel != nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	w.cancel = cancel
	w.run++
	run, previous, exited := w.run, w.exited, make(chan struct{})
	w.exited = exited
	go func() {
		defer close(exited)
		// One collector at a time: the last one may still be exiting.
		<-previous
		// Returns only once Stop cancels ctx.
		_ = WatchStatus(ctx, w.source, w.sleep, func(s Snapshot) { w.send(run, s) })
	}()
}

// Stop ends collecting without waiting for the collector to exit, so it
// never blocks the thread that reports window changes.
func (w *StatusWatcher) Stop() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.cancel == nil {
		return
	}
	w.cancel()
	w.cancel = nil
	w.run++
}

func (w *StatusWatcher) send(run uint64, s Snapshot) {
	w.emitting.Lock()
	defer w.emitting.Unlock()
	w.mu.Lock()
	current := run == w.run
	w.mu.Unlock()
	if current {
		w.emit(s)
	}
}
