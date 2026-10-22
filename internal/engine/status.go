// Package engine is Burrow's deep module: it decides what Burrow does with
// what Mole finds and measures. Services only translate it to IPC.
package engine

import (
	"context"
	"slices"

	"github.com/DiiKhanh/burrow/internal/mole"
)

// SeriesLength is how many samples a sparkline shows: a minute at one
// sample a second.
const SeriesLength = 60

// StatusSource streams samples to yield until ctx ends or the collector
// stops. mole.Bundle.WatchStatus is the real one.
type StatusSource func(ctx context.Context, yield func(mole.StatusSample)) error

// Snapshot is what the Status tab shows: the latest sample with the recent
// history of each sparkline. A nil field could not be read.
type Snapshot struct {
	Health        mole.Health   `json:"health"`
	Hardware      mole.Hardware `json:"hardware"`
	UptimeSeconds *uint64       `json:"uptimeSeconds"`
	CPU           mole.CPU      `json:"cpu"`
	Series        Series        `json:"series"`
}

// Series holds up to SeriesLength samples per sparkline, oldest first. A
// nil sample was missing from its reading.
type Series struct {
	// CPU is the CPU usage in percent.
	CPU []*float64 `json:"cpu"`
}

// WatchStatus sends a Snapshot to emit for every sample of source until ctx
// ends or source stops, and returns why it stopped.
func WatchStatus(ctx context.Context, source StatusSource, emit func(Snapshot)) error {
	var cpu []*float64
	return source(ctx, func(s mole.StatusSample) {
		cpu = latest(cpu, s.CPU.Usage)
		emit(Snapshot{
			Health:        s.Health,
			Hardware:      s.Hardware,
			UptimeSeconds: s.UptimeSeconds,
			CPU:           s.CPU,
			// Each snapshot gets its own copy: emitted ones stay as they were.
			Series: Series{CPU: slices.Clone(cpu)},
		})
	})
}

// latest appends v, dropping the oldest samples past SeriesLength.
func latest(series []*float64, v *float64) []*float64 {
	series = append(series, v)
	if len(series) > SeriesLength {
		series = slices.Delete(series, 0, len(series)-SeriesLength)
	}
	return series
}
