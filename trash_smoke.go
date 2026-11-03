//go:build smoke

package main

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// trashFor returns how the smoke build of Burrow moves an item into the
// Trash: into the .Trash folder of home, the fake HOME the smoke test starts
// it with, since the real Trash ignores HOME. It refuses a home outside the
// OS temp dir, so the smoke build launched with the real HOME moves nothing
// into the real Trash without Put Back. Only `bun run build:smoke` sets the
// tag; the shipped app has none of this.
func trashFor(home string) func(path string) error {
	return func(path string) error {
		inTemp, err := withinTempDir(home)
		if err != nil {
			return fmt.Errorf("smoke trash: %w", err)
		}
		if !inTemp {
			return fmt.Errorf("smoke trash: home %s lies outside the OS temp dir", home)
		}
		dir := filepath.Join(home, ".Trash")
		target := filepath.Join(dir, filepath.Base(path))
		// Rename would replace a file the fake Trash already holds.
		switch _, err := os.Lstat(target); {
		case err == nil:
			return fmt.Errorf("smoke trash: %s is taken", target)
		case !errors.Is(err, fs.ErrNotExist):
			return fmt.Errorf("smoke trash: %w", err)
		}
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return fmt.Errorf("smoke trash: %w", err)
		}
		if err := os.Rename(path, target); err != nil {
			return fmt.Errorf("smoke trash: %w", err)
		}
		return nil
	}
}

// withinTempDir reports whether path lies in the OS temp dir, symlinks
// resolved: on macOS, /var/folders is /private/var/folders.
func withinTempDir(path string) (bool, error) {
	temp, err := filepath.EvalSymlinks(os.TempDir())
	if err != nil {
		return false, fmt.Errorf("resolving the OS temp dir: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return false, fmt.Errorf("resolving %s: %w", path, err)
	}
	return strings.HasPrefix(resolved, temp+string(filepath.Separator)), nil
}
