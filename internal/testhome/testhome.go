// Package testhome creates the fake HOME shared by Burrow's unit,
// integration, and smoke tests. It never discovers or touches the real HOME.
package testhome

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/DiiKhanh/burrow/internal/clean"
)

// Item describes one file the generated HOME expects Mole to find.
type Item struct {
	GroupID clean.JunkGroupID `json:"groupId"`
	Path    string            `json:"path"`
	Bytes   int64             `json:"bytes"`
}

// Manifest is the independently known result of generating a HOME.
type Manifest struct {
	Home  string `json:"home"`
	Items []Item `json:"items"`
}

var fixtureItems = []struct {
	group clean.JunkGroupID
	path  string
	bytes int64
}{
	{clean.AppCaches, "Library/Caches/io.github.diikhanh.burrow/cache.data", 4_096},
	{clean.LogsSavedState, "Library/Logs/Burrow/scan.log", 2_048},
	{clean.Trash, ".Trash/old-download.data", 3_072},
	{clean.DeveloperTools, "Library/Developer/Xcode/DerivedData/Burrow/Build/object.o", 5_120},
	{clean.DeviceFirmware, "Library/iTunes/iPhone Software Updates/Burrow.ipsw", 6_144},
}

// Generate creates a deterministic fake HOME at home and returns its expected
// Scan items. The caller chooses the directory, which must be absolute.
func Generate(home string) (Manifest, error) {
	if !filepath.IsAbs(home) {
		return Manifest{}, fmt.Errorf("testhome: home must be absolute: %q", home)
	}
	home = filepath.Clean(home)
	manifest := Manifest{Home: home, Items: make([]Item, 0, len(fixtureItems))}
	for _, fixture := range fixtureItems {
		path := filepath.Join(home, filepath.FromSlash(fixture.path))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return Manifest{}, fmt.Errorf("testhome: creating %s: %w", filepath.Dir(path), err)
		}
		file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
		if err != nil {
			return Manifest{}, fmt.Errorf("testhome: creating %s: %w", path, err)
		}
		if err := file.Truncate(fixture.bytes); err != nil {
			_ = file.Close()
			return Manifest{}, fmt.Errorf("testhome: sizing %s: %w", path, err)
		}
		if err := file.Close(); err != nil {
			return Manifest{}, fmt.Errorf("testhome: closing %s: %w", path, err)
		}
		manifest.Items = append(manifest.Items, Item{
			GroupID: fixture.group,
			Path:    path,
			Bytes:   fixture.bytes,
		})
	}
	return manifest, nil
}
