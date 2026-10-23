package clean

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Remover removes one junk item from disk once the engine's guard passed it,
// with the RemovalMethod of its junk group.
type Remover interface {
	// Delete removes path and everything under it, for good.
	Delete(path string) error
	// MoveToTrash moves path into the macOS Trash, where it can be put back.
	MoveToTrash(path string) error
}

// errNoTrash means an OSRemover was built without a Trash function.
var errNoTrash = errors.New("clean: no way to move to Trash")

// OSRemover removes junk items for real. Trash moves one path into the
// macOS Trash: the app passes mygo.Shell.TrashItem, which keeps MyGo out of
// the engine.
type OSRemover struct {
	Trash func(path string) error
}

// Delete removes path and everything under it, for good.
func (OSRemover) Delete(path string) error {
	RequireTempDirInTests(path)
	return os.RemoveAll(path)
}

// MoveToTrash moves path into the macOS Trash with Trash.
func (r OSRemover) MoveToTrash(path string) error {
	RequireTempDirInTests(path)
	if r.Trash == nil {
		return errNoTrash
	}
	if err := r.Trash(path); err != nil {
		return fmt.Errorf("clean: moving %s to Trash: %w", path, err)
	}
	return nil
}

// RequireTempDirInTests panics when a test binary asks a Remover to touch a
// path outside the OS temp dir: a test that passed the real Home by mistake
// stops here instead of removing real files. Outside tests it does nothing.
func RequireTempDirInTests(path string) {
	if !testing.Testing() {
		return
	}
	temp, err := filepath.EvalSymlinks(os.TempDir())
	if err != nil {
		panic(fmt.Sprintf("clean: resolving the OS temp dir: %v", err))
	}
	resolved, err := filepath.EvalSymlinks(filepath.Dir(path))
	if err != nil {
		// A missing parent cannot be removed anyway; judge the path as given.
		resolved = filepath.Dir(path)
	}
	rel, err := filepath.Rel(temp, resolved)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		panic(fmt.Sprintf("clean: a test tried to remove %s, outside the OS temp dir %s", path, temp))
	}
}
