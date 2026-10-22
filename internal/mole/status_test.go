package mole

import (
	"os"
	"reflect"
	"strings"
	"testing"
)

func decodeAll(t *testing.T, ndjson string) ([]StatusSample, error) {
	t.Helper()
	var samples []StatusSample
	err := DecodeStatus(strings.NewReader(ndjson), func(s StatusSample) { samples = append(samples, s) })
	return samples, err
}

func ptr[T any](v T) *T { return &v }

func TestDecodeStatusReadsEverySampleOfTheStream(t *testing.T) {
	data, err := os.ReadFile("testdata/status-watch.ndjson")
	if err != nil {
		t.Fatal(err)
	}
	samples, err := decodeAll(t, string(data))
	if err != nil {
		t.Fatal(err)
	}
	if len(samples) != 2 {
		t.Fatalf("decoded %d samples, want 2", len(samples))
	}

	want := StatusSample{
		Health: Health{
			Score:   ptr(77),
			Level:   ptr(HealthGood),
			Reasons: []HealthReason{ReasonRestartRecommended},
		},
		Hardware: Hardware{
			CPUModel:  ptr("Apple M2"),
			RAM:       ptr("16.0 GB"),
			OSVersion: ptr("macOS 15.7.9"),
		},
		UptimeSeconds: ptr(uint64(1841475)),
		CPU: CPU{
			Usage:  ptr(13.544054928496225),
			Load1:  ptr(3.76025390625),
			Load5:  ptr(3.16455078125),
			Load15: ptr(3.74658203125),
			PCores: ptr(4),
			ECores: ptr(4),
		},
	}
	if !reflect.DeepEqual(samples[1], want) {
		t.Errorf("second sample =\n%+v\nwant\n%+v", samples[1], want)
	}
}

func TestDecodeStatusLeavesWhatMoleHasNotCollectedYetEmpty(t *testing.T) {
	// Mole's first snapshot is a fast one: no hardware, no core split.
	data, err := os.ReadFile("testdata/status-watch.ndjson")
	if err != nil {
		t.Fatal(err)
	}
	samples, err := decodeAll(t, string(data))
	if err != nil {
		t.Fatal(err)
	}
	first := samples[0]
	if first.Hardware != (Hardware{}) {
		t.Errorf("hardware = %+v, want every field empty", first.Hardware)
	}
	if first.CPU.PCores != nil || first.CPU.ECores != nil {
		t.Errorf("cores = %v P + %v E, want empty", first.CPU.PCores, first.CPU.ECores)
	}
	if first.CPU.Usage == nil || *first.CPU.Usage != 18.951923003426682 {
		t.Errorf("usage = %v, want 18.95…", first.CPU.Usage)
	}
	if want := []HealthReason{ReasonDiskAlmostFull, ReasonRestartRecommended}; !reflect.DeepEqual(first.Health.Reasons, want) {
		t.Errorf("reasons = %v, want %v", first.Health.Reasons, want)
	}
}

func TestDecodeStatusLeavesMissingFieldsEmpty(t *testing.T) {
	samples, err := decodeAll(t, `{"collected_at":"2026-10-23T00:46:45+07:00","cpu":{"usage":0}}`+"\n")
	if err != nil {
		t.Fatal(err)
	}
	want := StatusSample{CPU: CPU{Usage: ptr(0.0)}}
	if !reflect.DeepEqual(samples, []StatusSample{want}) {
		t.Errorf("samples = %+v, want %+v", samples, want)
	}
}

func TestDecodeStatusReadsTheHealthLevel(t *testing.T) {
	cases := map[string]*HealthLevel{
		"Excellent":                    ptr(HealthExcellent),
		"Good":                         ptr(HealthGood),
		"Fair: High CPU":               ptr(HealthFair),
		"Needs Attention: Overheating": ptr(HealthNeedsAttention),
		"Splendid":                     nil,
		"":                             nil,
	}
	for msg, want := range cases {
		t.Run(msg, func(t *testing.T) {
			samples, err := decodeAll(t, `{"health_score":50,"health_score_msg":"`+msg+`"}`)
			if err != nil {
				t.Fatal(err)
			}
			if got := samples[0].Health.Level; !reflect.DeepEqual(got, want) {
				t.Errorf("level = %v, want %v", deref(got), deref(want))
			}
		})
	}
}

func TestDecodeStatusReadsEveryHealthReasonMoleGives(t *testing.T) {
	msg := "Needs Attention: High CPU, High Memory, Memory Pressure, Critical Memory, Disk Almost Full, " +
		"Disk SMART Failing, Overheating, Heavy Disk IO, Battery Service Soon, Restart Recommended"
	samples, err := decodeAll(t, `{"health_score_msg":"`+msg+`"}`)
	if err != nil {
		t.Fatal(err)
	}
	want := []HealthReason{
		ReasonHighCPU, ReasonHighMemory, ReasonMemoryPressure, ReasonCriticalMemory, ReasonDiskAlmostFull,
		ReasonDiskSMARTFailing, ReasonOverheating, ReasonHeavyDiskIO, ReasonBatteryServiceSoon, ReasonRestartRecommended,
	}
	if got := samples[0].Health.Reasons; !reflect.DeepEqual(got, want) {
		t.Errorf("reasons = %v, want %v", got, want)
	}
}

func TestDecodeStatusDropsHealthReasonsItDoesNotKnow(t *testing.T) {
	samples, err := decodeAll(t, `{"health_score_msg":"Fair: Too Many Tabs, High CPU"}`)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := samples[0].Health.Reasons, []HealthReason{ReasonHighCPU}; !reflect.DeepEqual(got, want) {
		t.Errorf("reasons = %v, want %v", got, want)
	}
}

func TestDecodeStatusFailsOnABrokenStream(t *testing.T) {
	samples, err := decodeAll(t, `{"cpu":{"usage":1}}`+"\n"+`{"cpu":`)
	if err == nil {
		t.Fatal("err = nil, want a decoding error")
	}
	if len(samples) != 1 {
		t.Errorf("decoded %d samples before the broken line, want 1", len(samples))
	}
}

func deref[T any](p *T) any {
	if p == nil {
		return nil
	}
	return *p
}
