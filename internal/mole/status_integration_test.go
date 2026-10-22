//go:build integration

package mole

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestIntegrationBundledStatusStreamsSamples(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	var samples []StatusSample
	err := bundled(t).WatchStatus(ctx, func(s StatusSample) {
		samples = append(samples, s)
		if len(samples) == 3 {
			cancel()
		}
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("WatchStatus stopped with %v after %d samples, want it to run until canceled", err, len(samples))
	}

	// The first sample is Mole's fast one; later ones are complete.
	last := samples[len(samples)-1]
	if last.CPU.Usage == nil || last.CPU.Load1 == nil {
		t.Errorf("CPU = %+v, want usage and load", last.CPU)
	}
	if last.Health.Score == nil || last.Health.Level == nil {
		t.Errorf("health = %+v, want a score and a level", last.Health)
	}
	if last.Hardware.CPUModel == nil || last.Hardware.OSVersion == nil {
		t.Errorf("hardware = %+v, want the CPU model and macOS version", last.Hardware)
	}
	if last.UptimeSeconds == nil {
		t.Error("uptime is missing")
	}
}
