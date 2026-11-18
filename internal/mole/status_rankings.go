package mole

import (
	"bytes"
	"cmp"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"
)

// ResidentProcesses ranks the full process table, including sleeping processes.
func ResidentProcesses(ctx context.Context) ([]Process, error) {
	output, err := exec.CommandContext(ctx, "/bin/ps", "-axo", "pid=,rss=,comm=").Output()
	if err != nil {
		return nil, fmt.Errorf("mole: reading resident memory: %w", err)
	}
	var rows []Process
	for line := range strings.SplitSeq(string(output), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		pid, e := strconv.Atoi(fields[0])
		rss, f := strconv.ParseUint(fields[1], 10, 64)
		if e != nil || f != nil {
			continue
		}
		name := filepath.Base(strings.Join(fields[2:], " "))
		rows = append(rows, Process{PID: pid, Name: &name, MemoryBytes: ptrTo(rss * 1024)})
	}
	slices.SortStableFunc(rows, func(a, b Process) int { return cmp.Compare(*b.MemoryBytes, *a.MemoryBytes) })
	return rows[:min(len(rows), TopProcesses)], nil
}

type AppTraffic struct {
	Name     string  `json:"name"`
	Sent     float64 `json:"sent"`
	Received float64 `json:"received"`
}

// ApplicationTraffic samples one second of system-wide socket traffic. nettop's
// first block is cumulative even in delta mode. Only the second block is a rate.
func ApplicationTraffic(ctx context.Context) ([]AppTraffic, error) {
	output, err := exec.CommandContext(ctx, "/usr/bin/nettop", "-P", "-n", "-x", "-d", "-s", "1", "-L", "2", "-J", "time,bytes_in,bytes_out").Output()
	if err != nil {
		return nil, fmt.Errorf("mole: sampling application traffic: %w", err)
	}
	processes, err := exec.CommandContext(ctx, "/bin/ps", "-axo", "pid=,comm=").Output()
	if err != nil {
		return nil, fmt.Errorf("mole: identifying applications: %w", err)
	}
	apps := map[string]string{}
	for line := range strings.SplitSeq(string(processes), "\n") {
		pid, path, ok := strings.Cut(strings.TrimSpace(line), " ")
		if !ok {
			continue
		}
		path = strings.TrimSpace(path)
		if bundle, _, found := strings.Cut(path, ".app/"); found {
			apps[pid] = filepath.Base(bundle)
		} else {
			apps[pid] = filepath.Base(path)
		}
	}
	return rankTraffic(bytes.NewReader(output), apps)
}

func rankTraffic(input io.Reader, apps map[string]string) ([]AppTraffic, error) {
	reader := csv.NewReader(input)
	var sample int
	var start, end time.Time
	totals := map[string]AppTraffic{}
	for {
		row, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("mole: decoding nettop: %w", err)
		}
		if len(row) < 4 {
			continue
		}
		if row[0] == "time" && row[2] == "bytes_in" && row[3] == "bytes_out" {
			sample++
			continue
		}
		if sample == 1 && start.IsZero() {
			start, err = time.Parse("15:04:05", row[0])
			if err != nil {
				return nil, fmt.Errorf("mole: reading nettop baseline time: %w", err)
			}
		}
		if sample != 2 {
			continue
		}
		if end.IsZero() {
			end, err = time.Parse("15:04:05", row[0])
			if err != nil {
				return nil, fmt.Errorf("mole: reading nettop sample time: %w", err)
			}
		}
		dot := strings.LastIndexByte(row[1], '.')
		if dot < 0 {
			continue
		}
		app := apps[row[1][dot+1:]]
		if app == "" {
			continue
		}
		rx, e := strconv.ParseUint(row[2], 10, 64)
		tx, f := strconv.ParseUint(row[3], 10, 64)
		if e != nil || f != nil {
			continue
		}
		v := totals[app]
		v.Name = app
		v.Sent += float64(tx)
		v.Received += float64(rx)
		totals[app] = v
	}
	if sample != 2 {
		return nil, errors.New("mole: missing nettop interval")
	}
	elapsed := end.Sub(start)
	if elapsed < 0 {
		elapsed += 24 * time.Hour
	}
	if start.IsZero() || end.IsZero() || elapsed <= 0 || elapsed > 5*time.Second {
		return nil, errors.New("mole: nettop interval unavailable")
	}
	rows := make([]AppTraffic, 0, len(totals))
	for _, v := range totals {
		v.Sent /= elapsed.Seconds()
		v.Received /= elapsed.Seconds()
		rows = append(rows, v)
	}
	slices.SortFunc(rows, func(a, b AppTraffic) int {
		return cmp.Or(cmp.Compare(b.Sent+b.Received, a.Sent+a.Received), cmp.Compare(a.Name, b.Name))
	})
	return rows[:min(len(rows), TopProcesses)], nil
}
