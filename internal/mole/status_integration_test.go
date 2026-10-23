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
	err := bundled(t).WatchStatus(ctx, t.TempDir(), func(s StatusSample) {
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
	if last.HealthScore.Score == nil || last.HealthScore.Level == nil {
		t.Errorf("health score = %+v, want a score and a level Burrow knows", last.HealthScore)
	}
	if last.Hardware.CPUModel == nil || last.Hardware.OSVersion == nil {
		t.Errorf("hardware = %+v, want the CPU model and macOS version", last.Hardware)
	}
	if last.UptimeSeconds == nil {
		t.Error("uptime is missing")
	}
}
