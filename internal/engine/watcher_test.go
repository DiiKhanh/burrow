package engine

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/mole"
)

// collector is a fake status collector the test feeds by hand: every run
// shows up on runs and lasts until its context ends.
type collector struct {
	runs chan *collectorRun
}

type collectorRun struct {
	ctx   context.Context
	yield func(mole.StatusSample)
}

func newCollector() *collector { return &collector{runs: make(chan *collectorRun, 4)} }

func (c *collector) source(ctx context.Context, yield func(mole.StatusSample)) error {
	c.runs <- &collectorRun{ctx: ctx, yield: yield}
	<-ctx.Done()
	return ctx.Err()
}

func (c *collector) nextRun(t *testing.T) *collectorRun {
	t.Helper()
	select {
	case r := <-c.runs:
		return r
	case <-time.After(5 * time.Second):
		t.Fatal("the collector was not started")
		return nil
	}
}

func (c *collector) noRun(t *testing.T) {
	t.Helper()
	select {
	case <-c.runs:
		t.Fatal("a second collector was started")
	case <-time.After(50 * time.Millisecond):
	}
}

func (r *collectorRun) send(usage float64) {
	r.yield(mole.StatusSample{CPU: mole.CPU{Usage: &usage}})
}

func (r *collectorRun) stopped(t *testing.T) {
	t.Helper()
	select {
	case <-r.ctx.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("the collector kept running")
	}
}

// screen records what the page was sent.
type screen struct {
	mu        sync.Mutex
	snapshots []Snapshot
}

func (s *screen) show(snap Snapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.snapshots = append(s.snapshots, snap)
}

func (s *screen) cpuSeries() [][]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([][]any, len(s.snapshots))
	for i, snap := range s.snapshots {
		out[i] = values(snap.Series.CPU)
	}
	return out
}

func TestStatusWatcherCollectsWhileTheWindowIsShown(t *testing.T) {
	c, page := newCollector(), &screen{}
	w := NewStatusWatcher(c.source, page.show)
	defer w.Stop()

	w.Start()
	run := c.nextRun(t)
	run.send(10)
	run.send(20)

	if got := page.cpuSeries(); len(got) != 2 || len(got[1]) != 2 {
		t.Errorf("page got series %v, want [[10] [10 20]]", got)
	}
}

func TestStatusWatcherStopsWhenTheWindowIsHidden(t *testing.T) {
	c, page := newCollector(), &screen{}
	w := NewStatusWatcher(c.source, page.show)

	w.Start()
	run := c.nextRun(t)
	run.send(10)
	w.Stop()

	run.stopped(t)
	run.send(20) // already collected when the window hid
	if got := page.cpuSeries(); len(got) != 1 {
		t.Errorf("page got series %v after hiding, want only [[10]]", got)
	}
}

func TestStatusWatcherStartsHistoryAgainWhenTheWindowReturns(t *testing.T) {
	c, page := newCollector(), &screen{}
	w := NewStatusWatcher(c.source, page.show)
	defer w.Stop()

	w.Start()
	first := c.nextRun(t)
	first.send(10)
	first.send(20)
	w.Stop()
	first.stopped(t)

	w.Start()
	second := c.nextRun(t)
	second.send(30)

	got := page.cpuSeries()
	if last := got[len(got)-1]; len(last) != 1 || last[0] != 30.0 {
		t.Errorf("first series after showing again = %v, want [30]", last)
	}
}

func TestStatusWatcherRunsOneCollectorAtATime(t *testing.T) {
	c := newCollector()
	w := NewStatusWatcher(c.source, func(Snapshot) {})
	defer w.Stop()

	w.Start()
	c.nextRun(t)
	w.Start()
	c.noRun(t)
}

func TestStatusWatcherIgnoresHidingWhileHidden(t *testing.T) {
	c := newCollector()
	w := NewStatusWatcher(c.source, func(Snapshot) {})

	w.Stop()
	w.Start()
	run := c.nextRun(t)
	w.Stop()
	w.Stop()
	run.stopped(t)
}

func TestStatusWatcherRestartsACollectorThatStoppedOnItsOwn(t *testing.T) {
	runs := make(chan struct{}, 4)
	crashing := func(context.Context, func(mole.StatusSample)) error {
		runs <- struct{}{}
		return errors.New("status exited")
	}
	noWait := func(ctx context.Context, _ time.Duration) error { return ctx.Err() }
	w := newStatusWatcher(crashing, noWait, func(Snapshot) {})
	defer w.Stop()

	w.Start()
	waitFor(t, runs)
	waitFor(t, runs)
}

func TestStatusWatcherStartsTheNextCollectorOnceTheLastOneExited(t *testing.T) {
	exited := make(chan struct{})
	runs := make(chan int64, 4)
	var count atomic.Int64
	lingering := func(ctx context.Context, _ func(mole.StatusSample)) error {
		n := count.Add(1)
		runs <- n
		<-ctx.Done()
		if n == 1 {
			<-exited // the first collector takes its time to exit
		}
		return ctx.Err()
	}
	w := NewStatusWatcher(lingering, func(Snapshot) {})
	defer w.Stop()

	w.Start()
	waitFor(t, runs)
	w.Stop()
	w.Start()
	select {
	case <-runs:
		t.Fatal("a second collector started while the first was still exiting")
	case <-time.After(50 * time.Millisecond):
	}
	close(exited)
	waitFor(t, runs)
}

func waitFor[T any](t *testing.T, ch <-chan T) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out")
	}
}
