// Package service holds the MyGo bound services the frontend calls. They only
// translate between the engine and IPC; `mygo generate` turns them into the
// typed client in src/mygo.ts.
package service

import (
	"context"
	"errors"
	"log"
	"sync"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/engine"
	"github.com/DiiKhanh/burrow/internal/space"
	"github.com/egoist/mygo"
)

// ErrCleanUnavailable means app startup has not configured the Clean engine.
var ErrCleanUnavailable = errors.New("service: Clean engine unavailable")

// Clean is the bound service behind the Clean tab: Scan, Clean, and the
// locked junk groups.
type Clean struct {
	mu     sync.RWMutex
	engine *clean.Engine
}

// NewClean returns the bound service and an app-wiring function. Keeping
// configuration off the service's method set keeps it out of generated IPC.
func NewClean() (*Clean, func(*clean.Engine)) {
	s := &Clean{}
	return s, func(engine *clean.Engine) {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.engine = engine
	}
}

// Scan streams progress through updates and returns the complete preview.
// MyGo cancels ctx when the page closes updates.
func (s *Clean) Scan(ctx context.Context, updates *mygo.Channel[clean.ScanProgress]) (clean.ScanResult, error) {
	engine, err := s.currentEngine()
	if err != nil {
		return clean.ScanResult{}, err
	}
	result, err := engine.Scan(ctx, updates.Send)
	if errors.Is(err, mygo.ErrChannelClosed) {
		return clean.ScanResult{}, context.Canceled
	}
	return result, err
}

// Clean removes the selected junk items of the latest Scan, by id, streaming
// progress through updates. MyGo cancels ctx when the page closes updates.
func (s *Clean) Clean(ctx context.Context, ids []string, updates *mygo.Channel[clean.CleanProgress]) (clean.CleanReport, error) {
	engine, err := s.currentEngine()
	if err != nil {
		return clean.CleanReport{}, err
	}
	report, err := engine.Clean(ctx, ids, updates.Send)
	if errors.Is(err, mygo.ErrChannelClosed) {
		return clean.CleanReport{}, context.Canceled
	}
	return report, err
}

// Locked lists the junk groups locked right now, so Review unlocks a group
// once its apps quit, without a new Scan.
func (s *Clean) Locked() ([]clean.LockedGroup, error) {
	engine, err := s.currentEngine()
	if err != nil {
		return nil, err
	}
	locked, err := engine.Locked()
	if err != nil {
		log.Printf("service: listing locked junk groups: %v", err)
	}
	return locked, err
}

func (s *Clean) currentEngine() (*clean.Engine, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.engine == nil {
		return nil, ErrCleanUnavailable
	}
	return s.engine, nil
}

// ErrSpaceUnavailable means app startup has not configured the Space engine.
var ErrSpaceUnavailable = errors.New("service: Space engine unavailable")

// Space is the bound service behind the Space tab.
type Space struct {
	mu     sync.RWMutex
	engine *space.Engine
}

// NewSpace returns the bound service and an app-wiring function, as NewClean.
func NewSpace() (*Space, func(*space.Engine)) {
	s := &Space{}
	return s, func(engine *space.Engine) {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.engine = engine
	}
}

// NoProgress is never sent: a Measure has no progress to report. The
// channel that would carry it lets the page cancel the Measure.
type NoProgress struct{}

// Measure measures target. Space sends nothing through updates; MyGo
// cancels ctx when the page closes it, which stops the analyzer.
func (s *Space) Measure(ctx context.Context, target space.MeasureTarget, updates *mygo.Channel[NoProgress]) (space.MeasureResult, error) {
	engine, err := s.currentEngine()
	if err != nil {
		return space.MeasureResult{}, err
	}
	return engine.Measure(ctx, target)
}

// Reveal shows the Space item id in Finder. Go logs why when it cannot,
// so the page may drop the rejection.
func (s *Space) Reveal(id string) error {
	engine, err := s.currentEngine()
	if err == nil {
		err = engine.Reveal(id)
	}
	if err != nil {
		log.Printf("service: revealing Space item %s: %v", id, err)
	}
	return err
}

func (s *Space) currentEngine() (*space.Engine, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.engine == nil {
		return nil, ErrSpaceUnavailable
	}
	return s.engine, nil
}

// Status is the bound service behind the Status tab: live system health.
type Status struct{}

// StatusSnapshot carries every Status snapshot to the page, once a second
// while the window is shown. Each one holds the sparkline history, so the
// page keeps no state of its own.
var StatusSnapshot = mygo.NewEvent[engine.Snapshot]("status")

// BroadcastStatus sends s to every window.
func BroadcastStatus(s engine.Snapshot) {
	if err := StatusSnapshot.Broadcast(s); err != nil {
		log.Printf("service: sending status: %v", err)
	}
}

// Ping answers the page. MyGo binds only services with a method: remove it
// once Status has its first real one.
func (*Status) Ping() {}
