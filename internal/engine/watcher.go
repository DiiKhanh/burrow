package engine

import (
	"context"
	"errors"
	"log"
	"sync"
)

// StatusWatcher runs WatchStatus only while Burrow's window is shown: the
// app calls Show and Hide as the window appears, hides, minimizes or
// closes. History starts again on every Show.
type StatusWatcher struct {
	source StatusSource
	emit   func(Snapshot)

	mu     sync.Mutex
	run    uint64 // counts Shows; samples of an older run are dropped
	cancel context.CancelFunc

	// emitting keeps snapshots in order across runs: an older run finishes
	// sending before the next one starts.
	emitting sync.Mutex
}

// NewStatusWatcher returns a hidden watcher that sends snapshots of source
// to emit once shown.
func NewStatusWatcher(source StatusSource, emit func(Snapshot)) *StatusWatcher {
	return &StatusWatcher{source: source, emit: emit}
}

// Show starts collecting, unless it already is.
func (w *StatusWatcher) Show() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.cancel != nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	w.cancel = cancel
	w.run++
	run := w.run
	go func() {
		err := WatchStatus(ctx, w.source, func(s Snapshot) { w.send(run, s) })
		if err != nil && !errors.Is(err, context.Canceled) {
			log.Printf("engine: status stopped: %v", err)
		}
	}()
}

// Hide stops collecting without waiting for the collector to exit, so it
// never blocks the thread that reports window changes.
func (w *StatusWatcher) Hide() {
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
