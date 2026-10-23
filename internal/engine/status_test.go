package engine

import (
	"context"
	"errors"
	"fmt"
	"io"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/mole"
)

// ndjson is a fake collector stream with one sample per CPU usage; a nil
// usage leaves the field out.
func ndjson(usages ...*float64) string {
	var b strings.Builder
	for i, u := range usages {
		cpu := "{}"
		if u != nil {
			cpu = fmt.Sprintf(`{"usage":%g}`, *u)
		}
		fmt.Fprintf(&b, `{"uptime_seconds":%d,"health_score":90,"health_score_msg":"Excellent","cpu":%s}`+"\n", 100+i, cpu)
	}
	return b.String()
}

// streaming replays an NDJSON stream as the collector would print it.
func streaming(stream string) StatusSource {
	return func(_ context.Context, yield func(mole.StatusSample)) error {
		return mole.DecodeStatus(strings.NewReader(stream), yield)
	}
}

// watchAll runs one collector: WatchStatus stops when it would wait to
// start the next. It returns the snapshots sent while the collector ran.
func watchAll(t *testing.T, source StatusSource) ([]Snapshot, error) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	stopInsteadOfRetrying := func(ctx context.Context, _ time.Duration) error {
		cancel()
		return ctx.Err()
	}
	var snapshots []Snapshot
	err := WatchStatus(ctx, source, stopInsteadOfRetrying, func(s Snapshot) {
		if s.Collector == CollectorRunning {
			snapshots = append(snapshots, s)
		}
	})
	if !errors.Is(err, context.Canceled) {
		return snapshots, err
	}
	return snapshots, nil
}

// failing is a collector that stops at once on every run, after sending
// the samples of that run's usages.
func failing(runs ...[]float64) (StatusSource, *atomic.Int64) {
	var started atomic.Int64
	return func(_ context.Context, yield func(mole.StatusSample)) error {
		run := int(started.Add(1)) - 1
		if run < len(runs) {
			for _, usage := range runs[run] {
				yield(mole.StatusSample{CPU: mole.CPU{Usage: &usage}})
			}
		}
		return errors.New("status exited")
	}, &started
}

// waits records how long WatchStatus waits before each restart and stops
// it after the given number of waits.
func waits(t *testing.T, source StatusSource, count int, emit func(Snapshot)) []time.Duration {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	var delays []time.Duration
	sleep := func(ctx context.Context, d time.Duration) error {
		delays = append(delays, d)
		if len(delays) == count {
			cancel()
		}
		return ctx.Err()
	}
	if err := WatchStatus(ctx, source, sleep, emit); !errors.Is(err, context.Canceled) {
		t.Fatalf("WatchStatus = %v, want it to run until its context ends", err)
	}
	return delays
}

func usages(from, to int) []*float64 {
	var out []*float64
	for i := from; i <= to; i++ {
		v := float64(i)
		out = append(out, &v)
	}
	return out
}

func ptr[T any](v T) *T { return &v }

func TestWatchStatusSendsASnapshotPerSample(t *testing.T) {
	snapshots, err := watchAll(t, streaming(ndjson(ptr(12.5), ptr(40.0))))
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 2 {
		t.Fatalf("sent %d snapshots, want 2", len(snapshots))
	}
	last := snapshots[1]
	if last.CPU.Usage == nil || *last.CPU.Usage != 40 {
		t.Errorf("CPU usage = %v, want 40", last.CPU.Usage)
	}
	if last.UptimeSeconds == nil || *last.UptimeSeconds != 101 {
		t.Errorf("uptime = %v, want 101", last.UptimeSeconds)
	}
	if last.HealthScore.Level == nil || *last.HealthScore.Level != mole.HealthExcellent {
		t.Errorf("health level = %v, want excellent", last.HealthScore.Level)
	}
	if want := []*float64{ptr(12.5), ptr(40.0)}; !reflect.DeepEqual(last.Series.CPU, want) {
		t.Errorf("CPU series = %v, want [12.5 40]", values(last.Series.CPU))
	}
}

func TestWatchStatusKeepsTheLast60Samples(t *testing.T) {
	snapshots, err := watchAll(t, streaming(ndjson(usages(1, 75)...)))
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 75 {
		t.Fatalf("sent %d snapshots, want 75", len(snapshots))
	}
	if got := snapshots[59].Series.CPU; len(got) != 60 || *got[0] != 1 || *got[59] != 60 {
		t.Errorf("series after 60 samples = %v, want 1…60", values(got))
	}
	if got, want := snapshots[74].Series.CPU, usages(16, 75); !reflect.DeepEqual(got, want) {
		t.Errorf("series after 75 samples = %v, want 16…75", values(got))
	}
}

func TestWatchStatusSendsSeriesThatLaterSamplesLeaveAlone(t *testing.T) {
	snapshots, err := watchAll(t, streaming(ndjson(usages(1, 70)...)))
	if err != nil {
		t.Fatal(err)
	}
	if got, want := snapshots[60].Series.CPU, usages(2, 61); !reflect.DeepEqual(got, want) {
		t.Errorf("series sent after 61 samples became %v, want 2…61", values(got))
	}
}

func TestWatchStatusKeepsAGapForAMissingSample(t *testing.T) {
	snapshots, err := watchAll(t, streaming(ndjson(ptr(10.0), nil, ptr(30.0))))
	if err != nil {
		t.Fatal(err)
	}
	if snapshots[1].CPU.Usage != nil {
		t.Errorf("CPU usage of the sample without it = %v, want nil", *snapshots[1].CPU.Usage)
	}
	if got, want := snapshots[2].Series.CPU, []*float64{ptr(10.0), nil, ptr(30.0)}; !reflect.DeepEqual(got, want) {
		t.Errorf("series = %v, want [10 nil 30]", values(got))
	}
}

func TestWatchStatusKeepsHistoryForEveryStatusChart(t *testing.T) {
	stream := strings.Join([]string{
		`{"memory":{"used_percent":40},"network":[{"name":"en0","rx_rate_mbs":1}],"disk_io":{"read_rate":2},"thermal":{"cpu_temp":50}}`,
		`{"memory":{},"network":[],"disk_io":{},"thermal":{"cpu_temp":0}}`,
		`{"memory":{"used_percent":60},"network":[{"name":"en0","rx_rate_mbs":3}],"disk_io":{"read_rate":4},"thermal":{"cpu_temp":70}}`,
	}, "\n")
	snapshots, err := watchAll(t, streaming(stream))
	if err != nil {
		t.Fatal(err)
	}
	last := snapshots[2]
	wants := map[string]struct {
		got  []*float64
		want []*float64
	}{
		"memory":   {last.Series.Memory, []*float64{ptr(40.0), nil, ptr(60.0)}},
		"network":  {last.Series.NetworkDownload, []*float64{ptr(float64(1 << 20)), nil, ptr(float64(3 << 20))}},
		"disk I/O": {last.Series.DiskRead, []*float64{ptr(float64(2 << 20)), nil, ptr(float64(4 << 20))}},
		"thermal":  {last.Series.ThermalCPU, []*float64{ptr(50.0), nil, ptr(70.0)}},
	}
	for name, check := range wants {
		if !reflect.DeepEqual(check.got, check.want) {
			t.Errorf("%s series = %v, want %v", name, values(check.got), values(check.want))
		}
	}
}

func TestWatchStatusPassesEveryCurrentCardThrough(t *testing.T) {
	stream := `{
		"memory":{"used":12,"total":16,"used_percent":75,"swap_used":2,"pressure":"normal"},
		"network":[{"name":"en0","rx_rate_mbs":1,"tx_rate_mbs":0.5}],
		"batteries":[{"percent":80,"status":"discharging"}],
		"disks":[{"mount":"/","used":70,"total":100}],
		"disk_io":{"read_rate":2,"write_rate":3},
		"thermal":{"cpu_temp":45,"fan_count":0,"system_power":8,"adapter_power":30}
	}`
	snapshots, err := watchAll(t, streaming(stream))
	if err != nil {
		t.Fatal(err)
	}
	got := snapshots[0]
	if got.Memory.UsedPercent == nil || *got.Memory.UsedPercent != 75 || got.Network.Interface == nil || *got.Network.Interface != "en0" ||
		got.Battery == nil || got.Disk.Free == nil || *got.Disk.Free != 30 || got.DiskIO.WriteBytesPerSecond == nil ||
		got.Thermal.CPUCelsius == nil || got.Power.SystemWatts == nil {
		t.Errorf("snapshot did not pass every card through: %+v", got)
	}
}

func TestWatchStatusPassesTheTopProcessesThrough(t *testing.T) {
	snapshots, err := watchAll(t, streaming(`{"top_processes":[{"pid":512,"name":"Safari","cpu":40,"memory_bytes":4096}]}`))
	if err != nil {
		t.Fatal(err)
	}
	want := []mole.Process{{PID: 512, Name: ptr("Safari"), CPU: 40, MemoryBytes: ptr(uint64(4096))}}
	if got := snapshots[0].Processes; !reflect.DeepEqual(got, want) {
		t.Errorf("processes = %+v, want %+v", got, want)
	}
}

func TestWatchStatusPausesOnABrokenStream(t *testing.T) {
	var sent []Snapshot
	waits(t, streaming(ndjson(ptr(10.0))+`{"cpu":`), 1, func(s Snapshot) { sent = append(sent, s) })
	if len(sent) != 2 || sent[0].Collector != CollectorRunning || sent[1].Collector != CollectorRetrying {
		t.Fatalf("sent %d snapshots, want the sample before the broken line, then a pause", len(sent))
	}
}

func TestWatchStatusBacksOffWhileTheCollectorKeepsStopping(t *testing.T) {
	source, _ := failing()
	got := waits(t, source, 8, func(Snapshot) {})
	want := []time.Duration{
		1 * time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second,
		16 * time.Second, 30 * time.Second, 30 * time.Second, 30 * time.Second,
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("waits = %v, want %v", got, want)
	}
}

func TestWatchStatusBacksOffFromOneSecondAgainOnceTheCollectorRecovers(t *testing.T) {
	source, _ := failing(nil, nil, nil, []float64{10}, nil)
	got := waits(t, source, 5, func(Snapshot) {})
	want := []time.Duration{1 * time.Second, 2 * time.Second, 4 * time.Second, 1 * time.Second, 2 * time.Second}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("waits = %v, want %v", got, want)
	}
}

func TestWatchStatusKeepsTheLastValuesWhileRetrying(t *testing.T) {
	source, started := failing([]float64{10, 20}, []float64{30})
	var sent []Snapshot
	waits(t, source, 2, func(s Snapshot) { sent = append(sent, s) })
	if started.Load() != 2 {
		t.Fatalf("started %d collectors, want 2", started.Load())
	}

	var states []CollectorState
	for _, s := range sent {
		states = append(states, s.Collector)
	}
	if want := []CollectorState{CollectorRunning, CollectorRunning, CollectorRetrying, CollectorRunning, CollectorRetrying}; !reflect.DeepEqual(states, want) {
		t.Fatalf("collector states = %v, want %v", states, want)
	}
	paused := sent[2]
	if paused.CPU.Usage == nil || *paused.CPU.Usage != 20 || len(paused.Series.CPU) != 2 {
		t.Errorf("paused snapshot = usage %v series %v, want the last values: 20, [10 20]", paused.CPU.Usage, values(paused.Series.CPU))
	}
	if got, want := sent[3].Series.CPU, []*float64{ptr(10.0), ptr(20.0), ptr(30.0)}; !reflect.DeepEqual(got, want) {
		t.Errorf("series after recovering = %v, want the history to go on: [10 20 30]", values(got))
	}
}

func TestWatchStatusPausesWithNothingReadBeforeTheFirstSample(t *testing.T) {
	source, _ := failing()
	var sent []Snapshot
	waits(t, source, 1, func(s Snapshot) { sent = append(sent, s) })
	// Like Mole before it knows the model: a Battery card, nothing in it.
	want := Snapshot{Battery: &mole.Battery{}, Collector: CollectorRetrying}
	if len(sent) != 1 || !reflect.DeepEqual(sent[0], want) {
		t.Errorf("sent %+v, want only %+v", sent, want)
	}
}

func TestWatchStatusStopsWithItsContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	reader, writer := io.Pipe()
	source := func(ctx context.Context, yield func(mole.StatusSample)) error {
		go func() { <-ctx.Done(); writer.CloseWithError(ctx.Err()) }()
		return mole.DecodeStatus(reader, yield)
	}
	done := make(chan error)
	go func() { done <- WatchStatus(ctx, source, sleepContext, func(Snapshot) {}) }()

	cancel()
	if err := <-done; err == nil {
		t.Error("err = nil, want the context's error")
	}
}

func values(series []*float64) []any {
	out := make([]any, len(series))
	for i, v := range series {
		if v != nil {
			out[i] = *v
		}
	}
	return out
}
