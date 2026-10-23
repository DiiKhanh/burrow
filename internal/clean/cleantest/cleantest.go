// Package cleantest holds test doubles for the Clean engine.
package cleantest

import (
	"os"
	"sync"

	"github.com/DiiKhanh/burrow/internal/clean"
)

// FakeRemover removes for real, but only inside the OS temp dir: it panics
// on any other path. It records every path it was asked to remove.
type FakeRemover struct {
	mu      sync.Mutex
	deleted []string
	// Fail, when set, makes Delete return its error instead of removing.
	Fail func(path string) error
}

var _ clean.Remover = (*FakeRemover)(nil)

// Delete removes path and everything under it.
func (r *FakeRemover) Delete(path string) error {
	clean.RequireTempDirInTests(path)
	r.mu.Lock()
	r.deleted = append(r.deleted, path)
	r.mu.Unlock()
	if r.Fail != nil {
		if err := r.Fail(path); err != nil {
			return err
		}
	}
	return os.RemoveAll(path)
}

// Deleted returns the paths Delete was called with, in order.
func (r *FakeRemover) Deleted() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.deleted...)
}

// FakeProcesses stands in for the processes running on the Mac. Tests
// start and quit apps with Set, or make listing fail with Fail.
type FakeProcesses struct {
	mu    sync.Mutex
	names []string
	err   error
}

var _ clean.Processes = (*FakeProcesses)(nil)

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
