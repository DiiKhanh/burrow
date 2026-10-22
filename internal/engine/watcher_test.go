package engine

import (
	"context"
	"sync"
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
	defer w.Hide()

	w.Show()
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

	w.Show()
	run := c.nextRun(t)
	run.send(10)
	w.Hide()

	run.stopped(t)
	run.send(20) // already collected when the window hid
	if got := page.cpuSeries(); len(got) != 1 {
		t.Errorf("page got series %v after hiding, want only [[10]]", got)
	}
}

func TestStatusWatcherStartsHistoryAgainWhenTheWindowReturns(t *testing.T) {
	c, page := newCollector(), &screen{}
	w := NewStatusWatcher(c.source, page.show)
	defer w.Hide()

	w.Show()
	first := c.nextRun(t)
	first.send(10)
	first.send(20)
	w.Hide()
	first.stopped(t)

	w.Show()
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
	defer w.Hide()

	w.Show()
	c.nextRun(t)
	w.Show()
	c.noRun(t)
}

func TestStatusWatcherIgnoresHidingWhileHidden(t *testing.T) {
	c := newCollector()
	w := NewStatusWatcher(c.source, func(Snapshot) {})

	w.Hide()
	w.Show()
	run := c.nextRun(t)
	w.Hide()
	w.Hide()
	run.stopped(t)
}
