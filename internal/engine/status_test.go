package engine

import (
	"context"
	"fmt"
	"io"
	"reflect"
	"strings"
	"testing"

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

func watchAll(t *testing.T, source StatusSource) ([]Snapshot, error) {
	t.Helper()
	var snapshots []Snapshot
	err := WatchStatus(context.Background(), source, func(s Snapshot) { snapshots = append(snapshots, s) })
	return snapshots, err
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

func TestWatchStatusReportsABrokenStream(t *testing.T) {
	snapshots, err := watchAll(t, streaming(ndjson(ptr(10.0))+`{"cpu":`))
	if err == nil {
		t.Fatal("err = nil, want the stream's error")
	}
	if len(snapshots) != 1 {
		t.Errorf("sent %d snapshots, want 1 before the broken line", len(snapshots))
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
	go func() { done <- WatchStatus(ctx, source, func(Snapshot) {}) }()

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
