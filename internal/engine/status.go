// Package engine is Burrow's deep module: it decides what Burrow does with
// what Mole finds and measures. Services only translate it to IPC.
package engine

import (
	"context"
	"log"
	"slices"
	"time"

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
	HealthScore   mole.HealthScore       `json:"healthScore"`
	Hardware      mole.Hardware          `json:"hardware"`
	UptimeSeconds *uint64                `json:"uptimeSeconds"`
	CPU           mole.CPU               `json:"cpu"`
	Memory        mole.Memory            `json:"memory"`
	Network       mole.Network           `json:"network"`
	Battery       *mole.Battery          `json:"battery"`
	Power         mole.Power             `json:"power"`
	Disk          mole.Disk              `json:"disk"`
	DiskIO        mole.DiskIO            `json:"diskIO"`
	Thermal       mole.Thermal           `json:"thermal"`
	Bluetooth     []mole.BluetoothDevice `json:"bluetooth"`
	// Processes are the busiest by CPU, busiest first.
	Processes []mole.Process `json:"processes"`
	Series    Series         `json:"series"`
	Collector CollectorState `json:"collector"`
}

// CollectorState says whether the values are live.
type CollectorState string

const (
	// CollectorRunning: the values are the latest sample.
	CollectorRunning CollectorState = "running"
	// CollectorRetrying: the collector stopped and Burrow is starting it
	// again. The values are the last ones it sent.
	CollectorRetrying CollectorState = "retrying"
)

// Series holds up to SeriesLength samples per sparkline, oldest first. A
// nil sample was missing from its reading.
type Series struct {
	// CPU is the CPU usage in percent.
	CPU             []*float64 `json:"cpu"`
	Memory          []*float64 `json:"memory"`
	NetworkDownload []*float64 `json:"networkDownload"`
	DiskRead        []*float64 `json:"diskRead"`
	ThermalCPU      []*float64 `json:"thermalCPU"`
}

// WatchStatus sends a Snapshot to emit for every sample of source until ctx
// ends, and returns ctx's error. When the collector stops on its own it
// sends the last values again as CollectorRetrying, waits with sleep and
// starts it again: 1s, then twice as long after each run that sent
// nothing, up to 30s. History goes on across restarts.
func WatchStatus(ctx context.Context, source StatusSource, sleep Sleep, emit func(Snapshot)) error {
	var series Series
	// What a restart before the first sample shows: nothing read yet. Like
	// Mole before it knows the model, it keeps the Battery card in place.
	last := Snapshot{Battery: &mole.Battery{}}
	delay := firstRetry
	for {
		recovered := false
		err := source(ctx, func(s mole.StatusSample) {
			recovered = true
			series = series.next(s)
			last = snapshotOf(s, series)
			emit(last)
		})
		if ctx.Err() != nil {
			return ctx.Err()
		}
		log.Printf("engine: status collector stopped: %v", err)
		if recovered {
			delay = firstRetry
		}
		paused := last
		paused.Collector = CollectorRetrying
		emit(paused)
		if err := sleep(ctx, delay); err != nil {
			return err
		}
		delay = min(2*delay, lastRetry)
	}
}

// Sleep waits d or until ctx ends, and then returns ctx's error.
type Sleep func(ctx context.Context, d time.Duration) error

// How long WatchStatus waits before restarting a collector.
const (
	firstRetry = time.Second
	lastRetry  = 30 * time.Second
)

func sleepContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
	case <-timer.C:
	}
	return ctx.Err()
}

// next returns the series with s added. It never changes series, which an
// emitted Snapshot may hold.
func (series Series) next(s mole.StatusSample) Series {
	return Series{
		CPU:             latest(series.CPU, s.CPU.Usage),
		Memory:          latest(series.Memory, s.Memory.UsedPercent),
		NetworkDownload: latest(series.NetworkDownload, s.Network.DownloadBytesPerSecond),
		DiskRead:        latest(series.DiskRead, s.DiskIO.ReadBytesPerSecond),
		ThermalCPU:      latest(series.ThermalCPU, s.Thermal.CPUCelsius),
	}
}

// snapshotOf is what the Status tab shows for s, live.
func snapshotOf(s mole.StatusSample, series Series) Snapshot {
	return Snapshot{
		HealthScore:   s.HealthScore,
		Hardware:      s.Hardware,
		UptimeSeconds: s.UptimeSeconds,
		CPU:           s.CPU,
		Memory:        s.Memory,
		Network:       s.Network,
		Battery:       s.Battery,
		Power:         s.Power,
		Disk:          s.Disk,
		DiskIO:        s.DiskIO,
		Thermal:       s.Thermal,
		Bluetooth:     s.Bluetooth,
		Processes:     s.Processes,
		Series:        series,
		Collector:     CollectorRunning,
	}
}

// latest returns a new series of the last SeriesLength samples ending
// with v. It never changes series, which an emitted Snapshot may hold.
func latest(series []*float64, v *float64) []*float64 {
	kept := series[max(0, len(series)-SeriesLength+1):]
	return append(slices.Clip(kept), v)
}
