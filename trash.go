//go:build !smoke

package main

import "github.com/egoist/mygo"

// trashFor returns how Burrow moves an item into the Trash: the user's macOS
// Trash, which HOME does not change. The smoke build swaps it (trash_smoke.go).
func trashFor(string) func(path string) error {
	return mygo.Shell.TrashItem
}
