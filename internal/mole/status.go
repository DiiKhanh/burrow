package mole

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
)

// StatusSample is one reading of the Mac's health from the status
// collector. A field is nil when Mole did not report it.
type StatusSample struct {
	HealthScore   HealthScore       `json:"healthScore"`
	Hardware      Hardware          `json:"hardware"`
	UptimeSeconds *uint64           `json:"uptimeSeconds"`
	CPU           CPU               `json:"cpu"`
	Memory        Memory            `json:"memory"`
	Network       Network           `json:"network"`
	Battery       *Battery          `json:"battery"`
	Power         Power             `json:"power"`
	Disk          Disk              `json:"disk"`
	DiskIO        DiskIO            `json:"diskIO"`
	Thermal       Thermal           `json:"thermal"`
	Bluetooth     []BluetoothDevice `json:"bluetooth"`
	Processes     []Process         `json:"processes"`
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

// Memory is physical and swap memory usage.
type Memory struct {
	Used        *uint64         `json:"used"`
	Total       *uint64         `json:"total"`
	UsedPercent *float64        `json:"usedPercent"`
	SwapUsed    *uint64         `json:"swapUsed"`
	Pressure    *MemoryPressure `json:"pressure"`
}

// MemoryPressure is macOS's current memory pressure band.
type MemoryPressure string

const (
	MemoryNormal   MemoryPressure = "normal"
	MemoryWarn     MemoryPressure = "warn"
	MemoryCritical MemoryPressure = "critical"
)

// Network is the primary interface's current transfer rate.
type Network struct {
	DownloadBytesPerSecond *float64 `json:"downloadBytesPerSecond"`
	UploadBytesPerSecond   *float64 `json:"uploadBytesPerSecond"`
	Interface              *string  `json:"interface"`
}

// Battery is nil when the Mac has no battery.
type Battery struct {
	Percent         *float64      `json:"percent"`
	State           *BatteryState `json:"state"`
	TimeRemaining   *string       `json:"timeRemaining"`
	Cycles          *int          `json:"cycles"`
	MaximumCapacity *int          `json:"maximumCapacity"`
}

// BatteryState is the charging state Mole reports, normalized for the UI.
type BatteryState string

const (
	BatteryCharging    BatteryState = "charging"
	BatteryCharged     BatteryState = "charged"
	BatteryDischarging BatteryState = "discharging"
)

// Power is available on both laptops and desktop Macs.
type Power struct {
	SystemWatts  *float64 `json:"systemWatts"`
	AdapterWatts *float64 `json:"adapterWatts"`
}

// Disk is the startup disk only. Trash is nil when protected access failed.
type Disk struct {
	Free      *uint64 `json:"free"`
	Used      *uint64 `json:"used"`
	Total     *uint64 `json:"total"`
	Purgeable *uint64 `json:"purgeable"`
	Trash     *uint64 `json:"trash"`
}

// DiskIO is the aggregate disk transfer rate.
type DiskIO struct {
	ReadBytesPerSecond  *float64 `json:"readBytesPerSecond"`
	WriteBytesPerSecond *float64 `json:"writeBytesPerSecond"`
}

// Thermal contains the sensors Burrow can show without root.
type Thermal struct {
	CPUCelsius  *float64 `json:"cpuCelsius"`
	SystemWatts *float64 `json:"systemWatts"`
	HasFan      *bool    `json:"hasFan"`
	FanRPM      *int     `json:"fanRPM"`
}

// BluetoothDevice is one connected device. BatteryPercent is nil when Mole
// could not read that device's battery.
type BluetoothDevice struct {
	Name           string `json:"name"`
	BatteryPercent *int   `json:"batteryPercent"`
}

// Process is one of the busiest processes on the Mac.
type Process struct {
	PID  int     `json:"pid"`
	Name *string `json:"name"`
	// CPU is the share of one core in use, in percent, as ps reports it:
	// a process busy on two cores shows 200.
	CPU float64 `json:"cpu"`
	// MemoryBytes is the resident memory.
	MemoryBytes *uint64 `json:"memoryBytes"`
}

// TopProcesses is how many processes Status lists.
const TopProcesses = 5

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
func (b Bundle) WatchStatus(ctx context.Context, home string, yield func(StatusSample)) error {
	cmd := exec.CommandContext(ctx, b.Status(), "--watch", "--interval", StatusInterval)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("mole: connecting to the status collector: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("mole: starting the status collector: %w", err)
	}
	decodeErr := DecodeStatus(stdout, func(sample StatusSample) {
		// Mole V1.62.0 swallows errors while walking ~/.Trash and reports zero.
		// Keep an actual empty Trash distinct from protected access being denied.
		if !trashSizeAvailable(home) {
			sample.Disk.Trash = nil
		}
		yield(sample)
	})
	if decodeErr != nil {
		// Nothing reads the collector any more: it would block on a full pipe.
		_ = cmd.Process.Kill()
	}
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

// trashSizeAvailable checks only whether the same directory Mole scans can be
// enumerated. A missing directory is an available, empty Trash.
func trashSizeAvailable(home string) bool {
	dir, err := os.Open(filepath.Join(home, ".Trash"))
	if errors.Is(err, os.ErrNotExist) {
		return true
	}
	if err != nil {
		return false
	}
	defer func() { _ = dir.Close() }()
	_, err = dir.Readdirnames(1)
	return err == nil || errors.Is(err, io.EOF)
}

// DecodeStatus reads the collector's NDJSON stream, passing each sample to
// yield, until the stream ends or a line is not a snapshot.
func DecodeStatus(r io.Reader, yield func(StatusSample)) error {
	dec := json.NewDecoder(r)
	var machineHasBattery *bool
	for {
		var snap snapshot
		if err := dec.Decode(&snap); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return fmt.Errorf("mole: reading the status stream: %w", err)
		}
		if capability := snap.batteryCapability(); capability != nil {
			machineHasBattery = capability
		}
		yield(snap.sample(machineHasBattery))
	}
}

// snapshot is the part of the collector's MetricsSnapshot that Burrow
// shows (cmd/status/metrics.go). Pointers tell a missing field from zero.
type snapshot struct {
	UptimeSeconds  *uint64 `json:"uptime_seconds"`
	HealthScore    *int    `json:"health_score"`
	HealthScoreMsg *string `json:"health_score_msg"`
	Hardware       struct {
		Model     *string `json:"model"`
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
	Memory *struct {
		Used        *uint64  `json:"used"`
		Total       *uint64  `json:"total"`
		UsedPercent *float64 `json:"used_percent"`
		SwapUsed    *uint64  `json:"swap_used"`
		Pressure    *string  `json:"pressure"`
	} `json:"memory"`
	Disks []struct {
		Mount       *string  `json:"mount"`
		Used        *uint64  `json:"used"`
		Total       *uint64  `json:"total"`
		UsedPercent *float64 `json:"used_percent"`
		Purgeable   *uint64  `json:"purgeable"`
	} `json:"disks"`
	TrashSize *uint64 `json:"trash_size"`
	DiskIO    *struct {
		ReadRate  *float64 `json:"read_rate"`
		WriteRate *float64 `json:"write_rate"`
	} `json:"disk_io"`
	Network []struct {
		Name      *string  `json:"name"`
		RxRateMBs *float64 `json:"rx_rate_mbs"`
		TxRateMBs *float64 `json:"tx_rate_mbs"`
	} `json:"network"`
	Batteries []struct {
		Percent    *float64 `json:"percent"`
		Status     *string  `json:"status"`
		TimeLeft   *string  `json:"time_left"`
		CycleCount *int     `json:"cycle_count"`
		Capacity   *int     `json:"capacity"`
	} `json:"batteries"`
	Thermal *struct {
		CPUTemp      *float64 `json:"cpu_temp"`
		FanSpeed     *int     `json:"fan_speed"`
		FanCount     *int     `json:"fan_count"`
		SystemPower  *float64 `json:"system_power"`
		AdapterPower *float64 `json:"adapter_power"`
	} `json:"thermal"`
	Bluetooth []struct {
		Name      string  `json:"name"`
		Connected bool    `json:"connected"`
		Battery   *string `json:"battery"`
	} `json:"bluetooth"`
	TopProcesses []struct {
		PID         int     `json:"pid"`
		Name        *string `json:"name"`
		CPU         float64 `json:"cpu"`
		MemoryBytes *uint64 `json:"memory_bytes"`
	} `json:"top_processes"`
}

func (s snapshot) sample(machineHasBattery *bool) StatusSample {
	level, reasons := parseHealthMessage(s.HealthScoreMsg)
	memory := s.memory()
	network := s.primaryNetwork()
	battery := s.battery(machineHasBattery)
	power, thermal := s.powerAndThermal()
	disk := s.startupDisk()
	disk.Trash = s.TrashSize
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
		Memory:    memory,
		Network:   network,
		Battery:   battery,
		Power:     power,
		Disk:      disk,
		DiskIO:    s.diskIO(),
		Thermal:   thermal,
		Bluetooth: s.bluetoothDevices(),
		Processes: s.topProcesses(),
	}
}

const bytesPerMebibyte = 1024 * 1024

func (s snapshot) memory() Memory {
	if s.Memory == nil {
		return Memory{}
	}
	// A failed fast memory collection is serialized by Mole as a concrete
	// object whose numeric fields are all zero, rather than as a missing field.
	if zeroUint(s.Memory.Used) && zeroUint(s.Memory.Total) && zeroFloat(s.Memory.UsedPercent) &&
		zeroUint(s.Memory.SwapUsed) && (s.Memory.Pressure == nil || *s.Memory.Pressure == "") {
		return Memory{}
	}
	var pressure *MemoryPressure
	if s.Memory.Pressure != nil {
		value := MemoryPressure(strings.ToLower(*s.Memory.Pressure))
		switch value {
		case MemoryNormal, MemoryWarn, MemoryCritical:
			pressure = &value
		}
	}
	return Memory{Used: s.Memory.Used, Total: positiveUint(s.Memory.Total), UsedPercent: s.Memory.UsedPercent, SwapUsed: s.Memory.SwapUsed, Pressure: pressure}
}

func (s snapshot) primaryNetwork() Network {
	if len(s.Network) == 0 {
		return Network{}
	}
	n := s.Network[0]
	return Network{
		DownloadBytesPerSecond: mebibytesToBytes(n.RxRateMBs),
		UploadBytesPerSecond:   mebibytesToBytes(n.TxRateMBs),
		Interface:              nonEmpty(n.Name),
	}
}

func (s snapshot) batteryCapability() *bool {
	if len(s.Batteries) > 0 {
		return ptrTo(true)
	}
	if s.Hardware.Model == nil || *s.Hardware.Model == "" {
		return nil
	}
	return ptrTo(strings.Contains(strings.ToLower(*s.Hardware.Model), "macbook"))
}

func (s snapshot) battery(machineHasBattery *bool) *Battery {
	if len(s.Batteries) == 0 {
		// Mole's first fast snapshot and a failed battery collection both have
		// an empty batteries array. Only a known desktop model proves that the
		// machine has no battery. Unknown models keep a placeholder Battery card
		// until the full hardware snapshot arrives.
		if machineHasBattery != nil && !*machineHasBattery {
			return nil
		}
		return &Battery{}
	}
	b := s.Batteries[0]
	return &Battery{
		Percent:         b.Percent,
		State:           batteryState(b.Status),
		TimeRemaining:   nonEmpty(b.TimeLeft),
		Cycles:          nonNegativeInt(b.CycleCount),
		MaximumCapacity: positive(b.Capacity),
	}
}

func batteryState(raw *string) *BatteryState {
	if raw == nil {
		return nil
	}
	value := strings.ToLower(strings.TrimSpace(*raw))
	var state BatteryState
	switch {
	case value == "charged":
		state = BatteryCharged
	case strings.Contains(value, "discharg"):
		state = BatteryDischarging
	case strings.Contains(value, "charg"):
		state = BatteryCharging
	default:
		return nil
	}
	return &state
}

func (s snapshot) startupDisk() Disk {
	for _, d := range s.Disks {
		if d.Mount == nil || *d.Mount != "/" {
			continue
		}
		var free *uint64
		if d.Total != nil && d.Used != nil && *d.Total >= *d.Used {
			value := *d.Total - *d.Used
			free = &value
		}
		return Disk{Free: free, Used: d.Used, Total: positiveUint(d.Total), Purgeable: positiveUint(d.Purgeable)}
	}
	return Disk{}
}

func (s snapshot) diskIO() DiskIO {
	if s.DiskIO == nil {
		return DiskIO{}
	}
	return DiskIO{ReadBytesPerSecond: mebibytesToBytes(s.DiskIO.ReadRate), WriteBytesPerSecond: mebibytesToBytes(s.DiskIO.WriteRate)}
}

func (s snapshot) powerAndThermal() (Power, Thermal) {
	if s.Thermal == nil {
		return Power{}, Thermal{}
	}
	power := Power{SystemWatts: positiveFloat(s.Thermal.SystemPower), AdapterWatts: positiveFloat(s.Thermal.AdapterPower)}
	thermal := Thermal{CPUCelsius: positiveFloat(s.Thermal.CPUTemp), SystemWatts: power.SystemWatts}
	if s.Thermal.FanSpeed != nil {
		hasFan := *s.Thermal.FanSpeed > 0
		thermal.HasFan = &hasFan
		if hasFan {
			thermal.FanRPM = nonNegativeInt(s.Thermal.FanSpeed)
		}
	}
	return power, thermal
}

func (s snapshot) bluetoothDevices() []BluetoothDevice {
	var devices []BluetoothDevice
	for _, d := range s.Bluetooth {
		if !d.Connected || d.Name == "" {
			continue
		}
		device := BluetoothDevice{Name: d.Name}
		if d.Battery != nil {
			raw := strings.TrimSuffix(strings.TrimSpace(*d.Battery), "%")
			percent, err := strconv.Atoi(raw)
			if err == nil && percent >= 0 && percent <= 100 {
				device.BatteryPercent = &percent
			}
		}
		devices = append(devices, device)
	}
	return devices
}

// topProcesses keeps the TopProcesses busiest by CPU, busiest first. Mole
// already ranks them; sorting again keeps that promise if it ever stops.
func (s snapshot) topProcesses() []Process {
	var processes []Process
	for _, p := range s.TopProcesses {
		// Mole leaves memory_bytes out when ps reports no resident memory.
		processes = append(processes, Process{PID: p.PID, Name: nonEmpty(p.Name), CPU: p.CPU, MemoryBytes: p.MemoryBytes})
	}
	slices.SortStableFunc(processes, func(a, b Process) int { return cmp.Compare(b.CPU, a.CPU) })
	return processes[:min(len(processes), TopProcesses)]
}

func mebibytesToBytes(value *float64) *float64 {
	if value == nil || *value < 0 {
		return nil
	}
	bytes := *value * bytesPerMebibyte
	return &bytes
}

func positiveFloat(value *float64) *float64 {
	if value == nil || *value <= 0 {
		return nil
	}
	return value
}

func positiveUint(value *uint64) *uint64 {
	if value == nil || *value == 0 {
		return nil
	}
	return value
}

func zeroUint(value *uint64) bool {
	return value == nil || *value == 0
}

func zeroFloat(value *float64) bool {
	return value == nil || *value == 0
}

func ptrTo[T any](value T) *T {
	return &value
}

func nonNegativeInt(value *int) *int {
	if value == nil || *value < 0 {
		return nil
	}
	return value
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
