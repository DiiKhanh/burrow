package clean_test

import (
	"bufio"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/clean"
)

type historyLine struct {
	Time  time.Time `json:"time"`
	Items []struct {
		ID      string `json:"id"`
		Path    string `json:"path"`
		Bytes   int64  `json:"bytes"`
		Method  string `json:"method"`
		Outcome string `json:"outcome"`
		Reason  string `json:"reason"`
	} `json:"items"`
}

func TestCleanAppendsOneHistoryLinePerRun(t *testing.T) {
	home := newHome(t)
	cache := writeFile(t, home, "Library/Caches/app.cache", 10)
	logs := writeFile(t, home, "Library/Logs/app.log", 20)
	documents := filepath.Join(home, "Documents")
	engine := scannedEngine(t, home, clean.JunkGroup{ID: clean.AppCaches, RemovalMethod: clean.Delete, Items: []clean.JunkItem{
		{ID: "cache", Path: cache, Bytes: 10},
		{ID: "documents", Path: documents, Bytes: 30},
		{ID: "logs", Path: logs, Bytes: 20},
	}})
	before := time.Now().Add(-time.Second)

	if _, err := engine.Clean(context.Background(), []string{"cache", "documents", "forged"}, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := engine.Clean(context.Background(), []string{"logs"}, nil); err != nil {
		t.Fatal(err)
	}

	lines := readHistory(t, filepath.Join(home, "Library/Application Support/Burrow/history.jsonl"))
	if len(lines) != 2 {
		t.Fatalf("history has %d lines, want 2", len(lines))
	}
	if lines[0].Time.Before(before) || lines[0].Time.After(time.Now()) {
		t.Errorf("first run time = %v, want about now", lines[0].Time)
	}
	type entry struct {
		ID, Path, Method, Outcome, Reason string
		Bytes                             int64
	}
	var first []entry
	for _, item := range lines[0].Items {
		first = append(first, entry{item.ID, item.Path, item.Method, item.Outcome, item.Reason, item.Bytes})
	}
	wantFirst := []entry{
		{"forged", "", "", "skipped", "protected", 0},
		{"cache", cache, "delete", "removed", "", 10},
		{"documents", documents, "delete", "skipped", "protected", 30},
	}
	if len(first) != len(wantFirst) {
		t.Fatalf("first run items = %+v, want %+v", first, wantFirst)
	}
	for i := range wantFirst {
		if first[i] != wantFirst[i] {
			t.Errorf("first run item %d = %+v, want %+v", i, first[i], wantFirst[i])
		}
	}
	if len(lines[1].Items) != 1 || lines[1].Items[0].Path != logs || lines[1].Items[0].Outcome != "removed" {
		t.Errorf("second run items = %+v, want %s removed", lines[1].Items, logs)
	}
}

func TestCleanLogsAStoppedRunToHistory(t *testing.T) {
	home := newHome(t)
	cache := writeFile(t, home, "Library/Caches/app.cache", 10)
	engine := scannedEngine(t, home, clean.JunkGroup{ID: clean.AppCaches, RemovalMethod: clean.Delete, Items: []clean.JunkItem{
		{ID: "cache", Path: cache, Bytes: 10},
	}})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := engine.Clean(ctx, []string{"cache"}, nil); err == nil {
		t.Fatal("Clean with a cancelled context succeeded")
	}

	lines := readHistory(t, filepath.Join(home, "Library/Application Support/Burrow/history.jsonl"))
	if len(lines) != 1 || len(lines[0].Items) != 0 {
		t.Fatalf("history = %+v, want one run that removed nothing", lines)
	}
	assertExists(t, cache)
}

func readHistory(t *testing.T, path string) []historyLine {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := file.Close(); err != nil {
			t.Error(err)
		}
	}()
	var lines []historyLine
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var line historyLine
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			t.Fatalf("history line %q: %v", scanner.Text(), err)
		}
		lines = append(lines, line)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	return lines
}
