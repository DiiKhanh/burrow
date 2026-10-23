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
	return engine.Locked()
}

func (s *Clean) currentEngine() (*clean.Engine, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.engine == nil {
		return nil, ErrCleanUnavailable
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
