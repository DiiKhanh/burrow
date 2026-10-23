package mole

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
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
		HealthScore: HealthScore{
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
		Memory: Memory{
			Used:        ptr(uint64(14207320064)),
			Total:       ptr(uint64(17179869184)),
			UsedPercent: ptr(82.69),
		},
		Battery: &Battery{},
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
	if want := []HealthReason{ReasonDiskAlmostFull, ReasonRestartRecommended}; !reflect.DeepEqual(first.HealthScore.Reasons, want) {
		t.Errorf("reasons = %v, want %v", first.HealthScore.Reasons, want)
	}
}

func TestDecodeStatusLeavesMissingFieldsEmpty(t *testing.T) {
	samples, err := decodeAll(t, `{"collected_at":"2026-10-23T00:46:45+07:00","cpu":{"usage":0}}`+"\n")
	if err != nil {
		t.Fatal(err)
	}
	want := StatusSample{CPU: CPU{Usage: ptr(0.0)}, Battery: &Battery{}}
	if !reflect.DeepEqual(samples, []StatusSample{want}) {
		t.Errorf("samples = %+v, want %+v", samples, want)
	}
}

func TestDecodeStatusReadsTheRemainingStatusCards(t *testing.T) {
	samples, err := decodeAll(t, `{
		"memory":{"used":12000000000,"total":16000000000,"used_percent":75,"swap_used":500000000,"pressure":"warn"},
		"disks":[
			{"mount":"/Volumes/Backup","used":10,"total":100,"purgeable":2},
			{"mount":"/","used":180000000000,"total":250000000000,"used_percent":72,"purgeable":3000000000}
		],
		"trash_size":42000000,
		"disk_io":{"read_rate":1.5,"write_rate":0.25},
		"network":[{"name":"en0","rx_rate_mbs":2.5,"tx_rate_mbs":0.75}],
		"batteries":[{"percent":81,"status":"charging","time_left":"1:42","cycle_count":123,"capacity":91}],
		"thermal":{"cpu_temp":52.5,"fan_speed":1800,"fan_count":2,"system_power":14.25,"adapter_power":67},
		"bluetooth":[
			{"name":"Magic Mouse","connected":true,"battery":"64%"},
			{"name":"Sleeping Keyboard","connected":false,"battery":"91%"}
		]
	}`)
	if err != nil {
		t.Fatal(err)
	}

	want := StatusSample{
		Memory: Memory{
			Used: ptr(uint64(12000000000)), Total: ptr(uint64(16000000000)), UsedPercent: ptr(75.0),
			SwapUsed: ptr(uint64(500000000)), Pressure: ptr(MemoryWarn),
		},
		Network: Network{DownloadBytesPerSecond: ptr(2.5 * 1024 * 1024), UploadBytesPerSecond: ptr(0.75 * 1024 * 1024), Interface: ptr("en0")},
		Battery: &Battery{Percent: ptr(81.0), State: ptr(BatteryCharging), TimeRemaining: ptr("1:42"), Cycles: ptr(123), MaximumCapacity: ptr(91)},
		Power:   Power{SystemWatts: ptr(14.25), AdapterWatts: ptr(67.0)},
		Disk: Disk{
			Free: ptr(uint64(70000000000)), Used: ptr(uint64(180000000000)), Total: ptr(uint64(250000000000)),
			Purgeable: ptr(uint64(3000000000)), Trash: ptr(uint64(42000000)),
		},
		DiskIO:    DiskIO{ReadBytesPerSecond: ptr(1.5 * 1024 * 1024), WriteBytesPerSecond: ptr(0.25 * 1024 * 1024)},
		Thermal:   Thermal{CPUCelsius: ptr(52.5), SystemWatts: ptr(14.25), HasFan: ptr(true), FanRPM: ptr(1800)},
		Bluetooth: []BluetoothDevice{{Name: "Magic Mouse", BatteryPercent: ptr(64)}},
	}
	if !reflect.DeepEqual(samples, []StatusSample{want}) {
		t.Errorf("samples =\n%+v\nwant\n%+v", samples, []StatusSample{want})
	}
}

func TestDecodeStatusReadsTheTopProcessesByCPU(t *testing.T) {
	samples, err := decodeAll(t, `{"top_processes":[
		{"pid":88,"ppid":1,"name":"WindowServer","command":"/System/WindowServer","cpu":12.5,"memory":1.2,"memory_bytes":210000000},
		{"pid":512,"ppid":1,"name":"Safari","command":"/Applications/Safari.app","cpu":140.2,"memory":4.5,"memory_bytes":780000000},
		{"pid":1,"ppid":0,"name":"launchd","command":"/sbin/launchd","cpu":0.1,"memory":0},
		{"pid":7,"ppid":1,"name":"","command":"","cpu":3,"memory":0.1,"memory_bytes":4096},
		{"pid":42,"ppid":1,"name":"mds","command":"/usr/libexec/mds","cpu":3,"memory":0.4,"memory_bytes":90000000},
		{"pid":9,"ppid":1,"name":"Dock","command":"/System/Dock","cpu":1,"memory":0.2,"memory_bytes":50000000}
	]}`)
	if err != nil {
		t.Fatal(err)
	}
	want := []Process{
		{PID: 512, Name: ptr("Safari"), CPU: 140.2, MemoryBytes: ptr(uint64(780000000))},
		{PID: 88, Name: ptr("WindowServer"), CPU: 12.5, MemoryBytes: ptr(uint64(210000000))},
		{PID: 7, CPU: 3, MemoryBytes: ptr(uint64(4096))},
		{PID: 42, Name: ptr("mds"), CPU: 3, MemoryBytes: ptr(uint64(90000000))},
		{PID: 9, Name: ptr("Dock"), CPU: 1, MemoryBytes: ptr(uint64(50000000))},
	}
	if got := samples[0].Processes; !reflect.DeepEqual(got, want) {
		t.Errorf("processes =\n%+v\nwant the 5 busiest, busiest first\n%+v", got, want)
	}
}

func TestDecodeStatusUsesPowerWhenThereIsNoBatteryOrFan(t *testing.T) {
	samples, err := decodeAll(t, `{
		"hardware":{"model":"Mac mini"},
		"batteries":[],
		"thermal":{"cpu_temp":0,"fan_speed":0,"system_power":9.5,"adapter_power":30},
		"bluetooth":[{"name":"No devices","connected":false,"battery":""}]
	}`)
	if err != nil {
		t.Fatal(err)
	}
	sample := samples[0]
	if sample.Battery != nil {
		t.Errorf("battery = %+v, want nil", sample.Battery)
	}
	if sample.Thermal.CPUCelsius != nil {
		t.Errorf("CPU temperature = %v, want nil for Mole's unavailable zero", *sample.Thermal.CPUCelsius)
	}
	if sample.Thermal.HasFan == nil || *sample.Thermal.HasFan {
		t.Errorf("has fan = %v, want false", deref(sample.Thermal.HasFan))
	}
	if sample.Thermal.FanRPM != nil {
		t.Errorf("fan RPM = %v, want nil on a fanless Mac", *sample.Thermal.FanRPM)
	}
	if len(sample.Bluetooth) != 0 {
		t.Errorf("bluetooth = %+v, want no placeholder devices", sample.Bluetooth)
	}
}

func TestDecodeStatusKeepsTheBatteryCardWhenBatteryCollectionFails(t *testing.T) {
	samples, err := decodeAll(t, strings.Join([]string{
		`{"cpu":{"usage":10}}`,
		`{"hardware":{"model":"MacBook Air"},"batteries":[]}`,
	}, "\n"))
	if err != nil {
		t.Fatal(err)
	}
	for i, sample := range samples {
		if sample.Battery == nil || *sample.Battery != (Battery{}) {
			t.Errorf("sample %d battery = %+v, want an empty Battery", i, sample.Battery)
		}
	}
}

func TestDecodeStatusRemembersThatTheMachineHasNoBattery(t *testing.T) {
	samples, err := decodeAll(t, strings.Join([]string{
		`{"hardware":{"model":"Mac mini"},"batteries":[]}`,
		`{"cpu":{"usage":10},"batteries":[]}`,
	}, "\n"))
	if err != nil {
		t.Fatal(err)
	}
	for i, sample := range samples {
		if sample.Battery != nil {
			t.Errorf("sample %d battery = %+v, want nil", i, sample.Battery)
		}
	}
}

func TestDecodeStatusTreatsMolesZeroMemoryStructAsUnavailable(t *testing.T) {
	samples, err := decodeAll(t, `{"memory":{"used":0,"total":0,"used_percent":0,"swap_used":0,"pressure":""}}`)
	if err != nil {
		t.Fatal(err)
	}
	if samples[0].Memory != (Memory{}) {
		t.Errorf("memory = %+v, want every field unavailable", samples[0].Memory)
	}
}

func TestDecodeStatusInfersAFanFromMolesFanSpeed(t *testing.T) {
	samples, err := decodeAll(t, `{"thermal":{"fan_speed":1800}}`)
	if err != nil {
		t.Fatal(err)
	}
	thermal := samples[0].Thermal
	if thermal.HasFan == nil || !*thermal.HasFan || thermal.FanRPM == nil || *thermal.FanRPM != 1800 {
		t.Errorf("thermal = %+v, want a fan at 1800 RPM", thermal)
	}
}

func TestDecodeStatusKeepsConnectedBluetoothDevicesWithMissingBatteryData(t *testing.T) {
	samples, err := decodeAll(t, `{"bluetooth":[
		{"name":"Magic Keyboard","connected":true},
		{"name":"Trackpad","connected":true,"battery":"unknown"}
	]}`)
	if err != nil {
		t.Fatal(err)
	}
	want := []BluetoothDevice{{Name: "Magic Keyboard"}, {Name: "Trackpad"}}
	if !reflect.DeepEqual(samples[0].Bluetooth, want) {
		t.Errorf("bluetooth = %+v, want %+v", samples[0].Bluetooth, want)
	}
}

func TestDecodeStatusLeavesAWholeMissingCardEmpty(t *testing.T) {
	samples, err := decodeAll(t, `{}`)
	if err != nil {
		t.Fatal(err)
	}
	sample := samples[0]
	if sample.Memory != (Memory{}) || sample.Network != (Network{}) || sample.Disk != (Disk{}) ||
		sample.DiskIO != (DiskIO{}) || sample.Thermal != (Thermal{}) || sample.Power != (Power{}) {
		t.Errorf("missing cards were not empty: %+v", sample)
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
			if got := samples[0].HealthScore.Level; !reflect.DeepEqual(got, want) {
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
	if got := samples[0].HealthScore.Reasons; !reflect.DeepEqual(got, want) {
		t.Errorf("reasons = %v, want %v", got, want)
	}
}

func TestDecodeStatusDropsHealthReasonsItDoesNotKnow(t *testing.T) {
	samples, err := decodeAll(t, `{"health_score_msg":"Fair: Too Many Tabs, High CPU"}`)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := samples[0].HealthScore.Reasons, []HealthReason{ReasonHighCPU}; !reflect.DeepEqual(got, want) {
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

func TestWatchStatusStopsTheCollectorOnABrokenLine(t *testing.T) {
	dir := t.TempDir()
	fakeBundle(t, dir)
	// A collector that keeps sampling after printing a line that is not JSON.
	collector := "#!/bin/sh\necho 'status: warming up'\nexec sleep 30\n"
	if err := os.WriteFile(filepath.Join(dir, StatusPath), []byte(collector), 0o755); err != nil {
		t.Fatal(err)
	}

	done := make(chan error, 1)
	go func() { done <- Bundle{dir: dir}.WatchStatus(context.Background(), t.TempDir(), func(StatusSample) {}) }()
	select {
	case err := <-done:
		if err == nil || !strings.Contains(err.Error(), "reading the status stream") {
			t.Errorf("err = %v, want the stream's error", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("WatchStatus kept waiting for a collector whose stream broke")
	}
}

func TestWatchStatusMarksTrashUnavailableWhenItsDirectoryCannotBeRead(t *testing.T) {
	dir := t.TempDir()
	fakeBundle(t, dir)
	collector := "#!/bin/sh\necho '{\"trash_size\":0}'\n"
	if err := os.WriteFile(filepath.Join(dir, StatusPath), []byte(collector), 0o755); err != nil {
		t.Fatal(err)
	}
	home := t.TempDir()
	// A regular file where ~/.Trash should be deterministically fails directory reads.
	if err := os.WriteFile(filepath.Join(home, ".Trash"), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	var samples []StatusSample
	_ = (Bundle{dir: dir}).WatchStatus(context.Background(), home, func(s StatusSample) {
		samples = append(samples, s)
	})
	if len(samples) != 1 {
		t.Fatalf("received %d samples, want 1", len(samples))
	}
	if samples[0].Disk.Trash != nil {
		t.Errorf("Trash = %d, want unavailable", *samples[0].Disk.Trash)
	}
}

func deref[T any](p *T) any {
	if p == nil {
		return nil
	}
	return *p
}
