package removal

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// historyPath is where every removal run is logged, inside Burrow's
// Application Support folder under Home.
const historyPath = "Library/Application Support/Burrow/history.jsonl"

// historyRun is one line of the history file: one removal run.
type historyRun struct {
	Time  time.Time     `json:"time"`
	Items []HistoryItem `json:"items"`
}

// Outcome is what a run did with one item, as the history file says it.
type Outcome string

const (
	Removed Outcome = "removed"
	Skipped Outcome = "skipped"
)

// HistoryItem is one item of a run in the history file. Reason is set only
// for a skipped item.
type HistoryItem struct {
	ID      string        `json:"id"`
	Path    string        `json:"path"`
	Bytes   int64         `json:"bytes"`
	Method  RemovalMethod `json:"method"`
	Outcome Outcome       `json:"outcome"`
	Reason  SkipReason    `json:"reason,omitempty"`
}

// AppendHistory adds the run that started at with items as one JSON line to
// the history file under home, so a mistaken removal can be traced later.
func AppendHistory(home string, at time.Time, items []HistoryItem) error {
	// A run that removed nothing still logs "items":[], never null.
	if items == nil {
		items = []HistoryItem{}
	}
	line, err := json.Marshal(historyRun{Time: at, Items: items})
	if err != nil {
		return fmt.Errorf("removal: encoding history: %w", err)
	}
	path := filepath.Join(home, filepath.FromSlash(historyPath))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("removal: creating the history folder: %w", err)
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("removal: opening history: %w", err)
	}
	if _, err := file.Write(append(line, '\n')); err != nil {
		_ = file.Close()
		return fmt.Errorf("removal: writing history: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("removal: closing history: %w", err)
	}
	return nil
}
