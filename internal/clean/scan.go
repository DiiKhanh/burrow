// Package clean owns Burrow's Scan contract. Adapters translate their own
// formats into these codes so callers never need to know about Mole sections.
package clean

import (
	"context"
	"errors"
	"log/slog"
	"path/filepath"
	"sync"
)

// ErrBusy means a Scan or Clean is already running: they never overlap, so
// the shared Mole scan list and the current ScanResult stay consistent.
var ErrBusy = errors.New("clean: a Scan or Clean is already running")

// JunkGroupID is a stable, untranslated junk-group code.
type JunkGroupID string

const (
	AppCaches      JunkGroupID = "app-caches"
	Browsers       JunkGroupID = "browsers"
	LogsSavedState JunkGroupID = "logs-saved-state"
	Trash          JunkGroupID = "trash"
	DeveloperTools JunkGroupID = "developer-tools"
	Virtualization JunkGroupID = "virtualization"
	AppLeftovers   JunkGroupID = "app-leftovers"
	DeviceFirmware JunkGroupID = "device-firmware"
)

// RemovalMethod says how a later Clean removes a group.
type RemovalMethod string

const (
	Delete      RemovalMethod = "delete"
	MoveToTrash RemovalMethod = "move-to-trash"
)

// JunkItem is one path proposed by a Scan.
type JunkItem struct {
	ID    string `json:"id"`
	Path  string `json:"path"`
	Bytes int64  `json:"bytes"`
}

// JunkGroup collects items with one removal policy and selection default.
type JunkGroup struct {
	ID              JunkGroupID   `json:"id"`
	RemovalMethod   RemovalMethod `json:"removalMethod"`
	DefaultSelected bool          `json:"defaultSelected"`
	Items           []JunkItem    `json:"items"`
}

// ScanResult is the complete preview returned by Scan. Unreadable lists, in
// group order, the junk groups macOS privacy protection kept the Scan from
// reading in full: their items may be missing, or the group missing entirely.
// Locked lists the junk groups locked as the Scan ended; they may unlock
// later, without a new Scan.
type ScanResult struct {
	Groups     []JunkGroup   `json:"groups"`
	Unreadable []JunkGroupID `json:"unreadable"`
	Locked     []LockedGroup `json:"locked"`
}

// ScanProgress is an observable point in a running Scan. Fraction is nil
// when Mole exposes no reliable percentage for the active group.
type ScanProgress struct {
	GroupID     JunkGroupID `json:"groupId"`
	GroupBytes  int64       `json:"groupBytes"`
	FoundBytes  int64       `json:"foundBytes"`
	CurrentPath string      `json:"currentPath"`
	Fraction    *float64    `json:"fraction"`
}

// Scanner is the seam filled by the Mole adapter.
type Scanner interface {
	Scan(context.Context, func(ScanProgress) error) (ScanResult, error)
}

// Engine is the deep module callers use for Clean operations.
type Engine struct {
	scanner   Scanner
	home      string
	remover   Remover
	processes Processes
	logger    *slog.Logger
	// busy is held by the running Scan or Clean: they never overlap.
	busy sync.Mutex
	// current is the latest ScanResult, the only items Clean may remove.
	current ScanResult
}

// Options configures an Engine. Home is injected so nothing inside the
// engine looks up the real home folder.
type Options struct {
	Scanner   Scanner
	Home      string
	Remover   Remover
	Processes Processes
	Logger    *slog.Logger
}

// NewEngine constructs an Engine from its injected Home and adapters.
func NewEngine(options Options) *Engine {
	logger := options.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return &Engine{
		scanner:   options.Scanner,
		home:      filepath.Clean(options.Home),
		remover:   options.Remover,
		processes: options.Processes,
		logger:    logger,
	}
}

// Scan finds junk without removing anything. Its result becomes the set of
// items a later Clean may remove.
func (e *Engine) Scan(ctx context.Context, onProgress func(ScanProgress) error) (ScanResult, error) {
	if !e.busy.TryLock() {
		return ScanResult{}, ErrBusy
	}
	defer e.busy.Unlock()
	e.current = ScanResult{}
	result, err := e.scanner.Scan(ctx, onProgress)
	if err != nil {
		return ScanResult{}, err
	}
	if result.Locked, err = e.Locked(); err != nil {
		return ScanResult{}, err
	}
	e.current = result
	return result, nil
}
