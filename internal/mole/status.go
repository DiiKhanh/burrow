package mole

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os/exec"
	"strings"
)

// StatusSample is one reading of the Mac's health from the status
// collector. A field is nil when Mole did not report it.
type StatusSample struct {
	HealthScore   HealthScore `json:"healthScore"`
	Hardware      Hardware    `json:"hardware"`
	UptimeSeconds *uint64     `json:"uptimeSeconds"`
	CPU           CPU         `json:"cpu"`
}

// HealthScore is Mole's 0-100 Health score with its level and the issues
// that lowered it.
type HealthScore struct {
	Score   *int           `json:"score"`
	Level   *HealthLevel   `json:"level"`
	Reasons []HealthReason `json:"reasons"`
}

// HealthLevel is the band of the Health score Mole names.
type HealthLevel string

// Mole's bands, best first.
const (
	HealthExcellent      HealthLevel = "excellent"
	HealthGood           HealthLevel = "good"
	HealthFair           HealthLevel = "fair"
	HealthNeedsAttention HealthLevel = "needs-attention"
)

// HealthReason is one issue that lowered the Health score.
type HealthReason string

// Every issue Mole reports.
const (
	ReasonHighCPU            HealthReason = "high-cpu"
	ReasonHighMemory         HealthReason = "high-memory"
	ReasonMemoryPressure     HealthReason = "memory-pressure"
	ReasonCriticalMemory     HealthReason = "critical-memory"
	ReasonDiskAlmostFull     HealthReason = "disk-almost-full"
	ReasonDiskSMARTFailing   HealthReason = "disk-smart-failing"
	ReasonOverheating        HealthReason = "overheating"
	ReasonHeavyDiskIO        HealthReason = "heavy-disk-io"
	ReasonBatteryServiceSoon HealthReason = "battery-service-soon"
	ReasonRestartRecommended HealthReason = "restart-recommended"
)

// Hardware is how Mole describes the Mac, shown as Mole words it.
type Hardware struct {
	CPUModel  *string `json:"cpuModel"`
	RAM       *string `json:"ram"`
	OSVersion *string `json:"osVersion"`
}

// CPU is the processor's load.
type CPU struct {
	// Usage is the share of all cores in use, in percent.
	Usage  *float64 `json:"usage"`
	Load1  *float64 `json:"load1"`
	Load5  *float64 `json:"load5"`
	Load15 *float64 `json:"load15"`
	// PCores and ECores count the performance and efficiency cores.
	PCores *int `json:"pCores"`
	ECores *int `json:"eCores"`
}

// The words of Mole's health_score_msg, "<level>: <reason>, <reason>"
// (cmd/status/metrics_health.go).
var (
	healthLevels = map[string]HealthLevel{
		"Excellent":       HealthExcellent,
		"Good":            HealthGood,
		"Fair":            HealthFair,
		"Needs Attention": HealthNeedsAttention,
	}
	healthReasons = map[string]HealthReason{
		"High CPU":             ReasonHighCPU,
		"High Memory":          ReasonHighMemory,
		"Memory Pressure":      ReasonMemoryPressure,
		"Critical Memory":      ReasonCriticalMemory,
		"Disk Almost Full":     ReasonDiskAlmostFull,
		"Disk SMART Failing":   ReasonDiskSMARTFailing,
		"Overheating":          ReasonOverheating,
		"Heavy Disk IO":        ReasonHeavyDiskIO,
		"Battery Service Soon": ReasonBatteryServiceSoon,
		"Restart Recommended":  ReasonRestartRecommended,
	}
)

// StatusInterval is how often the collector samples: Status refreshes
// every second (#10).
const StatusInterval = "1s"

// WatchStatus runs the bundled status collector, one sample per
// StatusInterval, and
// passes each sample to yield until ctx ends or the collector stops.
func (b Bundle) WatchStatus(ctx context.Context, yield func(StatusSample)) error {
	cmd := exec.CommandContext(ctx, b.Status(), "--watch", "--interval", StatusInterval)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("mole: connecting to the status collector: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("mole: starting the status collector: %w", err)
	}
	decodeErr := DecodeStatus(stdout, yield)
	waitErr := cmd.Wait()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if decodeErr != nil {
		return decodeErr
	}
	if waitErr != nil {
		return fmt.Errorf("mole: the status collector stopped: %w", waitErr)
	}
	return errors.New("mole: the status collector stopped")
}

// DecodeStatus reads the collector's NDJSON stream, passing each sample to
// yield, until the stream ends or a line is not a snapshot.
func DecodeStatus(r io.Reader, yield func(StatusSample)) error {
	dec := json.NewDecoder(r)
	for {
		var snap snapshot
		if err := dec.Decode(&snap); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return fmt.Errorf("mole: reading the status stream: %w", err)
		}
		yield(snap.sample())
	}
}

// snapshot is the part of the collector's MetricsSnapshot that Burrow
// shows (cmd/status/metrics.go). Pointers tell a missing field from zero.
type snapshot struct {
	UptimeSeconds  *uint64 `json:"uptime_seconds"`
	HealthScore    *int    `json:"health_score"`
	HealthScoreMsg *string `json:"health_score_msg"`
	Hardware       struct {
		CPUModel  *string `json:"cpu_model"`
		TotalRAM  *string `json:"total_ram"`
		OSVersion *string `json:"os_version"`
	} `json:"hardware"`
	CPU struct {
		Usage      *float64 `json:"usage"`
		Load1      *float64 `json:"load1"`
		Load5      *float64 `json:"load5"`
		Load15     *float64 `json:"load15"`
		PCoreCount *int     `json:"p_core_count"`
		ECoreCount *int     `json:"e_core_count"`
	} `json:"cpu"`
}

func (s snapshot) sample() StatusSample {
	level, reasons := parseHealthMessage(s.HealthScoreMsg)
	return StatusSample{
		HealthScore:   HealthScore{Score: s.HealthScore, Level: level, Reasons: reasons},
		UptimeSeconds: s.UptimeSeconds,
		// Mole's first, fast snapshot leaves hardware blank and cores at 0.
		Hardware: Hardware{
			CPUModel:  nonEmpty(s.Hardware.CPUModel),
			RAM:       nonEmpty(s.Hardware.TotalRAM),
			OSVersion: nonEmpty(s.Hardware.OSVersion),
		},
		CPU: CPU{
			Usage:  s.CPU.Usage,
			Load1:  s.CPU.Load1,
			Load5:  s.CPU.Load5,
			Load15: s.CPU.Load15,
			PCores: positive(s.CPU.PCoreCount),
			ECores: positive(s.CPU.ECoreCount),
		},
	}
}

// parseHealthMessage turns "Good: Disk Almost Full, Restart Recommended"
// into its level and reasons, dropping and logging words it does not know.
func parseHealthMessage(msg *string) (*HealthLevel, []HealthReason) {
	if msg == nil || *msg == "" {
		return nil, nil
	}
	head, tail, _ := strings.Cut(*msg, ": ")
	var level *HealthLevel
	if l, ok := healthLevels[head]; ok {
		level = &l
	} else {
		log.Printf("mole: unknown health level %q", head)
	}
	var reasons []HealthReason
	if tail != "" {
		for _, word := range strings.Split(tail, ", ") {
			if r, ok := healthReasons[word]; ok {
				reasons = append(reasons, r)
			} else {
				log.Printf("mole: unknown health reason %q", word)
			}
		}
	}
	return level, reasons
}

func nonEmpty(s *string) *string {
	if s == nil || *s == "" {
		return nil
	}
	return s
}

func positive(n *int) *int {
	if n == nil || *n <= 0 {
		return nil
	}
	return n
}
