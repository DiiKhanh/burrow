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
	Series        Series                 `json:"series"`
}

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
// ends or source stops, and returns why it stopped.
func WatchStatus(ctx context.Context, source StatusSource, emit func(Snapshot)) error {
	var cpu, memory, network, diskRead, thermal []*float64
	return source(ctx, func(s mole.StatusSample) {
		cpu = latest(cpu, s.CPU.Usage)
		memory = latest(memory, s.Memory.UsedPercent)
		network = latest(network, s.Network.DownloadBytesPerSecond)
		diskRead = latest(diskRead, s.DiskIO.ReadBytesPerSecond)
		thermal = latest(thermal, s.Thermal.CPUCelsius)
		emit(Snapshot{
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
			Series: Series{
				CPU: cpu, Memory: memory, NetworkDownload: network, DiskRead: diskRead, ThermalCPU: thermal,
			},
		})
	})
}

// latest returns a new series of the last SeriesLength samples ending
// with v. It never changes series, which an emitted Snapshot may hold.
func latest(series []*float64, v *float64) []*float64 {
	kept := series[max(0, len(series)-SeriesLength+1):]
	return append(slices.Clip(kept), v)
}
