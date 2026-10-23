package clean

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Remover removes one junk item from disk once the engine's guard passed it.
// Move to Trash joins Delete here with its own ticket (#23).
type Remover interface {
	Delete(path string) error
}

// OSRemover removes junk items for real.
type OSRemover struct{}

// Delete removes path and everything under it, for good.
func (OSRemover) Delete(path string) error {
	RequireTempDirInTests(path)
	return os.RemoveAll(path)
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
