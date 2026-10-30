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
	"slices"
	"time"
)

// ErrInvalidTarget means a Measure was asked for a target Space does not know.
var ErrInvalidTarget = errors.New("space: invalid Measure target")

// TargetKind is what a Measure measures.
type TargetKind string

const (
	// Overview is the machine-wide overview: the locations of the Mac and
	// Mole's Insights.
	Overview TargetKind = "overview"
)

// MeasureTarget says what one Measure measures. Each Space item that opens
// will carry the target the UI sends back.
type MeasureTarget struct {
	Kind TargetKind `json:"kind"`
}

// SpaceItem is one file or folder shown in Space with its size. Its ID stays
// the same for its path, so a later Measure keeps it.
type SpaceItem struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Path  string `json:"path"`
	Bytes int64  `json:"bytes"`
	IsDir bool   `json:"isDir"`
}

// MeasureResult is what one Measure found, as of MeasuredAt, when it
// started: a change to the disk while it ran may be missing. Items and
// Insights are each sorted largest first. Insights lie inside the items, so
// TotalBytes adds up the items only, never counting the same bytes twice.
type MeasureResult struct {
	Target     MeasureTarget `json:"target"`
	MeasuredAt time.Time     `json:"measuredAt"`
	Items      []SpaceItem   `json:"items"`
	Insights   []SpaceItem   `json:"insights"`
	TotalBytes int64         `json:"totalBytes"`
}

// MeasuredItem is one file or folder as the adapter measured it. Insight
// marks a location Mole flags as commonly taking hidden space.
type MeasuredItem struct {
	Name    string
	Path    string
	Bytes   int64
	IsDir   bool
	Insight bool
}

// Measurement is what the adapter measured for one target.
type Measurement struct {
	Items []MeasuredItem
}

// Measurer is the seam filled by the Mole adapter.
type Measurer interface {
	Measure(context.Context, MeasureTarget) (Measurement, error)
}

// Engine is the deep module callers use for Space.
type Engine struct {
	measurer Measurer
}

// Options configures an Engine.
type Options struct {
	Measurer Measurer
}

// NewEngine constructs an Engine from its adapters.
func NewEngine(options Options) *Engine {
	return &Engine{measurer: options.Measurer}
}

// Measure computes the sizes target holds without removing anything. It
// runs alongside a Scan or Clean.
func (e *Engine) Measure(ctx context.Context, target MeasureTarget) (MeasureResult, error) {
	if target.Kind != Overview {
		return MeasureResult{}, fmt.Errorf("%w: %q", ErrInvalidTarget, target.Kind)
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
	for _, measured := range measurement.Items {
		item := SpaceItem{
			ID:    itemID(measured.Path),
			Name:  measured.Name,
			Path:  measured.Path,
			Bytes: measured.Bytes,
			IsDir: measured.IsDir,
		}
		if measured.Insight {
			result.Insights = append(result.Insights, item)
			continue
		}
		result.Items = append(result.Items, item)
		result.TotalBytes += item.Bytes
	}
	slices.SortStableFunc(result.Items, largestFirst)
	slices.SortStableFunc(result.Insights, largestFirst)
	return result, nil
}

func largestFirst(a, b SpaceItem) int {
	return cmp.Compare(b.Bytes, a.Bytes)
}

func itemID(path string) string {
	sum := sha256.Sum256([]byte(path))
	return hex.EncodeToString(sum[:])
}
