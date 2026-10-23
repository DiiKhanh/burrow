//go:build realtrash

// Package realtrash moves a file into the real macOS Trash through MyGo, the
// way Burrow.app does. It touches the user's Trash, so it runs only when
// asked: `bun run test:realtrash`. CI never runs it.
package realtrash

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/egoist/mygo"
)

// TestMain runs the tests inside a MyGo app: Shell.TrashItem needs one.
func TestMain(m *testing.M) {
	mygo.App.WhenReady(func() {
		go func() { os.Exit(m.Run()) }()
	})
	if err := mygo.App.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "running the MyGo app: %v\n", err)
		os.Exit(1)
	}
}

func TestOSRemoverMovesToTheMacOSTrash(t *testing.T) {
	name := fmt.Sprintf("burrow-realtrash-%d", time.Now().UnixNano())
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte("Put Back me"), 0o644); err != nil {
		t.Fatal(err)
	}
	remover := clean.OSRemover{Trash: mygo.Shell.TrashItem}

	if err := remover.MoveToTrash(path); err != nil {
		t.Fatalf("MoveToTrash(%s): %v", path, err)
	}

	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Fatalf("%s is still in place (lstat error %v)", path, err)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	trashed := filepath.Join(home, ".Trash", name)
	if _, err := os.Lstat(trashed); err != nil {
		// Reading ~/.Trash needs Full Disk Access for the terminal.
		t.Skipf("%s left its place, but the Trash could not be read to confirm it: %v", path, err)
	}
	t.Cleanup(func() {
		if err := os.Remove(trashed); err != nil {
			t.Logf("could not remove the test file from the Trash: %v", err)
		}
	})
}
