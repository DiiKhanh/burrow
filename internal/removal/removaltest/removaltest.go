// Package removaltest holds test doubles for the removal package, which
// Clean and Space share.
package removaltest

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/DiiKhanh/burrow/internal/removal"
)

// FakeRemover removes for real, but only inside the OS temp dir: it panics
// on any other path. Delete removes for good; MoveToTrash moves into
// TrashDir, a stand-in for the macOS Trash such as `<temp>/.Trash`. It
// records every path it was asked to remove, by method.
type FakeRemover struct {
	// TrashDir is where MoveToTrash puts items; it is created when needed.
	TrashDir string
	// Fail, when set, makes Delete and MoveToTrash return its error instead
	// of removing.
	Fail func(path string) error

	mu      sync.Mutex
	deleted []string
	trashed []string
}

var _ removal.Remover = (*FakeRemover)(nil)

// Delete removes path and everything under it.
func (r *FakeRemover) Delete(path string) error {
	removal.RequireTempDirInTests(path)
	r.record(&r.deleted, path)
	if err := r.failure(path); err != nil {
		return err
	}
	return os.RemoveAll(path)
}

// MoveToTrash moves path into TrashDir. Like the Finder, it gives an item
// a numbered name, "Gone App 2", when TrashDir already holds its name.
func (r *FakeRemover) MoveToTrash(path string) error {
	removal.RequireTempDirInTests(path)
	if r.TrashDir == "" {
		panic("removaltest: FakeRemover.MoveToTrash needs a TrashDir")
	}
	removal.RequireTempDirInTests(r.TrashDir)
	r.record(&r.trashed, path)
	if err := r.failure(path); err != nil {
		return err
	}
	if _, err := os.Lstat(path); err != nil {
		return err
	}
	if err := os.MkdirAll(r.TrashDir, 0o700); err != nil {
		return err
	}
	return os.Rename(path, freeName(r.TrashDir, filepath.Base(path)))
}

// Deleted returns the paths Delete was called with, in order.
func (r *FakeRemover) Deleted() []string {
	return r.recorded(&r.deleted)
}

// Trashed returns the paths MoveToTrash was called with, in order.
func (r *FakeRemover) Trashed() []string {
	return r.recorded(&r.trashed)
}

func (r *FakeRemover) record(paths *[]string, path string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	*paths = append(*paths, path)
}

func (r *FakeRemover) recorded(paths *[]string) []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), *paths...)
}

func (r *FakeRemover) failure(path string) error {
	if r.Fail == nil {
		return nil
	}
	return r.Fail(path)
}

// freeName returns the first path in dir for name that nothing holds yet.
func freeName(dir, name string) string {
	candidate := filepath.Join(dir, name)
	for n := 2; ; n++ {
		if _, err := os.Lstat(candidate); os.IsNotExist(err) {
			return candidate
		}
		candidate = filepath.Join(dir, fmt.Sprintf("%s %d", name, n))
	}
}

// FakeProcesses stands in for the processes running on the Mac. Tests
// start and quit apps with Set, or make listing fail with Fail.
type FakeProcesses struct {
	mu    sync.Mutex
	names []string
	err   error
}

var _ removal.Processes = (*FakeProcesses)(nil)

// NewFakeProcesses returns processes with names running.
func NewFakeProcesses(names ...string) *FakeProcesses {
	return &FakeProcesses{names: names}
}

// Set replaces the running processes with names, and lists them again.
func (p *FakeProcesses) Set(names ...string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.names = names
	p.err = nil
}

// Fail makes every later Names return err.
func (p *FakeProcesses) Fail(err error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.err = err
}

// Names returns the running processes, or the error set by Fail.
func (p *FakeProcesses) Names() ([]string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.err != nil {
		return nil, p.err
	}
	return append([]string(nil), p.names...), nil
}
