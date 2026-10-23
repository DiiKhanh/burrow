// Package service holds the MyGo bound services the frontend calls. They only
// translate between the engine and IPC; `mygo generate` turns them into the
// typed client in src/mygo.ts.
package service

import (
	"context"
	"errors"
	"sync"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/egoist/mygo"
)

// ErrCleanUnavailable means app startup has not configured the Clean engine.
var ErrCleanUnavailable = errors.New("service: Clean engine unavailable")

// Clean is the bound service behind the Clean tab: Scan and Clean.
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
	s.mu.RLock()
	engine := s.engine
	s.mu.RUnlock()
	if engine == nil {
		return clean.ScanResult{}, ErrCleanUnavailable
	}
	result, err := engine.Scan(ctx, updates.Send)
	if errors.Is(err, mygo.ErrChannelClosed) {
		return clean.ScanResult{}, context.Canceled
	}
	return result, err
}

// Status is the bound service behind the Status tab: live system health.
type Status struct{}

// Ping answers the page. MyGo binds only services with a method: remove it
// once Status has its first real one.
func (*Status) Ping() {}
