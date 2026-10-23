package clean

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// historyPath is where every Clean run is logged, inside Burrow's
// Application Support folder under Home.
const historyPath = "Library/Application Support/Burrow/history.jsonl"

// historyRun is one line of the history file: one Clean run.
type historyRun struct {
	Time  time.Time     `json:"time"`
	Items []historyItem `json:"items"`
}

// outcome is what Clean did with one junk item, as the history file says it.
type outcome string

const (
	removed outcome = "removed"
	skipped outcome = "skipped"
)

type historyItem struct {
	ID      string        `json:"id"`
	Path    string        `json:"path"`
	Bytes   int64         `json:"bytes"`
	Method  RemovalMethod `json:"method"`
	Outcome outcome       `json:"outcome"`
	Reason  SkipReason    `json:"reason,omitempty"`
}

// appendHistory adds report as one JSON line to the history file under home,
// so a mistaken removal can be traced later.
func appendHistory(home string, at time.Time, report CleanReport) error {
	run := historyRun{Time: at, Items: make([]historyItem, 0, len(report.Items))}
	for _, item := range report.Items {
		logged := historyItem{ID: item.ID, Path: item.Path, Bytes: item.Bytes, Outcome: removed}
		if item.Method != nil {
			logged.Method = *item.Method
		}
		if item.SkipReason != nil {
			logged.Outcome = skipped
			logged.Reason = *item.SkipReason
		}
		run.Items = append(run.Items, logged)
	}
	line, err := json.Marshal(run)
	if err != nil {
		return fmt.Errorf("encoding Clean history: %w", err)
	}
	path := filepath.Join(home, filepath.FromSlash(historyPath))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("creating the Clean history folder: %w", err)
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("opening Clean history: %w", err)
	}
	if _, err := file.Write(append(line, '\n')); err != nil {
		_ = file.Close()
		return fmt.Errorf("writing Clean history: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("closing Clean history: %w", err)
	}
	return nil
}
