// Package space owns Burrow's Space contract: what a Measure returns and the
// rules Burrow applies to what Mole measures. Adapters translate their own
// formats into Measurement, so callers never see Mole's.
package space

import (
	"cmp"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/DiiKhanh/burrow/internal/clean"
)

// ErrInvalidTarget means a Measure was asked for a target Space does not know.
var ErrInvalidTarget = errors.New("space: invalid Measure target")

// ErrUnknownItem means no current result of this session lists a Space item
// id.
var ErrUnknownItem = errors.New("space: unknown Space item")

// TargetKind is what a Measure measures.
type TargetKind string

const (
	// Overview is the machine-wide overview: the locations of the Mac and
	// Mole's Insights.
	Overview TargetKind = "overview"
	// Folder is one folder's contents, anywhere on the Mac: Measure only
	// reads.
	Folder TargetKind = "folder"
)

// oldDownloadsDays is the age Mole's Old Downloads Insight counts.
const oldDownloadsDays = 90

// MeasureTarget says what one Measure measures. Each Space item that opens
// carries the target the UI sends back. Path is set for a Folder only, as
// are the two narrowings an overview row needs for the total inside to match
// it: ExcludeLibrary leaves ~/Library out of Home, and a positive
// OlderThanDays lists only the items, hidden ones aside, not modified for
// that many days.
type MeasureTarget struct {
	Kind           TargetKind `json:"kind"`
	Path           string     `json:"path,omitempty"`
	ExcludeLibrary bool       `json:"excludeLibrary,omitempty"`
	OlderThanDays  int        `json:"olderThanDays,omitempty"`
}

// narrowed is true for a target that lists only part of its folder.
func (t MeasureTarget) narrowed() bool {
	return t.ExcludeLibrary || t.OlderThanDays > 0
}

func (t MeasureTarget) valid(home string) bool {
	switch t.Kind {
	case Overview:
		return t == MeasureTarget{Kind: Overview}
	case Folder:
		return CleanAbsolute(t.Path) && t.OlderThanDays >= 0 && (!t.ExcludeLibrary || t.Path == home)
	default:
		return false
	}
}

// CleanAbsolute is true for an absolute path already in its clean form,
// which rules out `..`, and free of control characters and invalid UTF-8.
func CleanAbsolute(path string) bool {
	return filepath.IsAbs(path) &&
		filepath.Clean(path) == path &&
		utf8.ValidString(path) &&
		!strings.ContainsFunc(path, unicode.IsControl)
}

// Tag is a stable, untranslated label on a Space item.
type Tag string

const (
	// TagInsight marks a location Mole flags as commonly taking hidden
	// space.
	TagInsight Tag = "insight"
	// TagRegenerable marks a folder whose content its tools make again,
	// such as node_modules, a build output or a folder with a CACHEDIR.TAG.
	TagRegenerable Tag = "regenerable"
	// TagCleanHandles marks an item in the folders Clean empties: removing
	// it is Clean's job.
	TagCleanHandles Tag = "clean-handles"
)

// ReadState says how much of a Space item a Measure could read.
type ReadState string

const (
	// ReadComplete means its size covers all of it.
	ReadComplete ReadState = "complete"
	// ReadPartial means part of it could not be read, so its size may be
	// low.
	ReadPartial ReadState = "partial"
	// ReadUnavailable means it could not be read, so it has no size.
	ReadUnavailable ReadState = "unavailable"
)

// SpaceItem is one file or folder shown in Space with its size. Its ID stays
// the same for its path, so a later Measure keeps it. Opens is the target
// that measures a folder's contents, nil for anything else, including a
// folder whose ReadState is unavailable: measuring it could only fail.
type SpaceItem struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Path      string         `json:"path"`
	Bytes     int64          `json:"bytes"`
	IsDir     bool           `json:"isDir"`
	ReadState ReadState      `json:"readState"`
	Tags      []Tag          `json:"tags"`
	Opens     *MeasureTarget `json:"opens"`
}

// MeasureResult is what one Measure found, as of MeasuredAt, when it
// started: a change to the disk while it ran may be missing. Items,
// Insights and LargestFiles are each sorted largest first. Insights lie
// inside the items, and LargestFiles anywhere below a folder's items, so
// TotalBytes adds up the items only, never counting the same bytes twice.
// An item with no size adds nothing, so TotalBytes is what could be read.
// LargestFiles is set for a folder only, never for the overview.
type MeasureResult struct {
	Target       MeasureTarget `json:"target"`
	MeasuredAt   time.Time     `json:"measuredAt"`
	Items        []SpaceItem   `json:"items"`
	Insights     []SpaceItem   `json:"insights"`
	LargestFiles []SpaceItem   `json:"largestFiles,omitzero"`
	TotalBytes   int64         `json:"totalBytes"`
}

// MeasuredItem is one file or folder as the adapter measured it. Insight
// marks a location Mole flags as commonly taking hidden space, Regenerable
// a folder whose content its tools make again, such as node_modules. ModTime
// is when an item directly in a folder was last modified, zero when unknown.
type MeasuredItem struct {
	Name        string
	Path        string
	Bytes       int64
	IsDir       bool
	ReadState   ReadState
	Insight     bool
	Regenerable bool
	ModTime     time.Time
}

// Measurement is what the adapter measured for one target. LargestFiles
// are files anywhere below a folder, nil for the overview.
type Measurement struct {
	Items        []MeasuredItem
	LargestFiles []MeasuredItem
}

// Measurer is the seam filled by the Mole adapter.
type Measurer interface {
	Measure(context.Context, MeasureTarget) (Measurement, error)
}

// Engine is the deep module callers use for Space.
type Engine struct {
	measurer Measurer
	home     string
	reveal   func(path string)

	mu sync.Mutex
	// current holds, per target measured this session, the latest result's
	// Space items by id (ADR 0004): Measure again replaces its target's
	// ids, while those of other folders stay. It lives in memory only.
	current map[MeasureTarget]map[string]string
}

// Options configures an Engine. Reveal shows a path in Finder: the app
// passes mygo.Shell.ShowItemInFolder.
type Options struct {
	Measurer Measurer
	Home     string
	Reveal   func(path string)
}

// NewEngine constructs an Engine from its adapters.
func NewEngine(options Options) *Engine {
	return &Engine{
		measurer: options.Measurer,
		home:     filepath.Clean(options.Home),
		reveal:   options.Reveal,
		current:  make(map[MeasureTarget]map[string]string),
	}
}

// Measure computes the sizes target holds without removing anything. It
// runs alongside a Scan or Clean.
func (e *Engine) Measure(ctx context.Context, target MeasureTarget) (MeasureResult, error) {
	if !target.valid(e.home) {
		return MeasureResult{}, fmt.Errorf("%w: %+v", ErrInvalidTarget, target)
	}
	measuredAt := time.Now()
	measurement, err := e.measurer.Measure(ctx, target)
	if err != nil {
		return MeasureResult{}, err
	}
	result := MeasureResult{
		Target:     target,
		MeasuredAt: measuredAt,
		Items:      []SpaceItem{},
		Insights:   []SpaceItem{},
	}
	listed := make(map[string]bool, len(measurement.Items))
	for _, measured := range measurement.Items {
		if !e.lists(target, measured, measuredAt) {
			continue
		}
		listed[measured.Path] = true
		item := e.spaceItem(measured)
		if measured.IsDir && measured.ReadState != ReadUnavailable {
			item.Opens = e.opens(target, measured)
		}
		if measured.Insight {
			result.Insights = append(result.Insights, item)
			continue
		}
		result.Items = append(result.Items, item)
		result.TotalBytes += item.Bytes
	}
	if target.Kind == Folder {
		result.LargestFiles = make([]SpaceItem, 0, len(measurement.LargestFiles))
		for _, measured := range measurement.LargestFiles {
			if target.narrowed() && !listed[holder(target.Path, measured.Path)] {
				continue
			}
			result.LargestFiles = append(result.LargestFiles, e.spaceItem(measured))
		}
	}
	slices.SortStableFunc(result.Items, largestFirst)
	slices.SortStableFunc(result.Insights, largestFirst)
	slices.SortStableFunc(result.LargestFiles, largestFirst)
	e.remember(target, result.Items, result.Insights, result.LargestFiles)
	return result, nil
}

// lists reports whether a Measure of target shows measured. The old part of
// a folder holds what Mole's Old Downloads Insight counts: hidden items never
// do, and a time the adapter could not read is not known to be old.
func (e *Engine) lists(target MeasureTarget, measured MeasuredItem, measuredAt time.Time) bool {
	if target.ExcludeLibrary && measured.Path == filepath.Join(e.home, "Library") {
		return false
	}
	if target.OlderThanDays == 0 {
		return true
	}
	cutoff := measuredAt.AddDate(0, 0, -target.OlderThanDays)
	return !strings.HasPrefix(measured.Name, ".") && !measured.ModTime.IsZero() && measured.ModTime.Before(cutoff)
}

// opens is the target that measures the folder measured, a row of the result
// of target. In the overview, Home and Old Downloads count only part of it.
func (e *Engine) opens(target MeasureTarget, measured MeasuredItem) *MeasureTarget {
	folder := MeasureTarget{Kind: Folder, Path: measured.Path}
	if target.Kind == Overview {
		folder.ExcludeLibrary = measured.Path == e.home
		if measured.Insight && measured.Path == filepath.Join(e.home, "Downloads") {
			folder.OlderThanDays = oldDownloadsDays
		}
	}
	return &folder
}

// holder is the item directly in folder that path, below it, lies in or is.
func holder(folder, path string) string {
	rel := strings.TrimPrefix(path, strings.TrimSuffix(folder, "/")+"/")
	first, _, _ := strings.Cut(rel, "/")
	return filepath.Join(folder, first)
}

// spaceItem is measured as Space shows it, opening nothing.
func (e *Engine) spaceItem(measured MeasuredItem) SpaceItem {
	tags := []Tag{}
	if measured.Insight {
		tags = append(tags, TagInsight)
	}
	if measured.Regenerable {
		tags = append(tags, TagRegenerable)
	}
	if e.cleanHandles(measured.Path) {
		tags = append(tags, TagCleanHandles)
	}
	bytes := measured.Bytes
	if measured.ReadState == ReadUnavailable {
		// Whatever the adapter reports for it, it must not reach the total.
		bytes = 0
	}
	return SpaceItem{
		ID:        itemID(measured.Path),
		Name:      measured.Name,
		Path:      measured.Path,
		Bytes:     bytes,
		IsDir:     measured.IsDir,
		ReadState: measured.ReadState,
		Tags:      tags,
	}
}

// cleanHandles reports whether path lies in the folders Clean empties. It
// labels the path as measured, without resolving symlinks: a label, not a
// safety check.
func (e *Engine) cleanHandles(path string) bool {
	rel, err := filepath.Rel(e.home, path)
	if err != nil || rel == ".." || strings.HasPrefix(rel, "../") {
		return false
	}
	return clean.InGround(filepath.ToSlash(rel))
}

// Reveal shows the Space item id in Finder. It takes an id a current result
// lists, never a path (ADR 0004); anywhere on the Mac is fine, since it
// only shows.
func (e *Engine) Reveal(id string) error {
	if e.reveal == nil {
		return errors.New("space: revealing: no way to reveal configured")
	}
	path, ok := e.measuredPath(id)
	if !ok {
		return fmt.Errorf("space: revealing: %w: %q", ErrUnknownItem, id)
	}
	e.reveal(path)
	return nil
}

func (e *Engine) remember(target MeasureTarget, lists ...[]SpaceItem) {
	paths := make(map[string]string)
	for _, list := range lists {
		for _, item := range list {
			paths[item.ID] = item.Path
		}
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.current[target] = paths
}

// measuredPath is the path of the Space item id, if a current result of
// this session lists it.
func (e *Engine) measuredPath(id string) (string, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, paths := range e.current {
		if path, ok := paths[id]; ok {
			return path, true
		}
	}
	return "", false
}

func largestFirst(a, b SpaceItem) int {
	return cmp.Compare(b.Bytes, a.Bytes)
}

func itemID(path string) string {
	sum := sha256.Sum256([]byte(path))
	return hex.EncodeToString(sum[:])
}
