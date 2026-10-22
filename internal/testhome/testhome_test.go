package testhome_test

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/testhome"
)

func TestGenerateCreatesTheSharedMoleFixture(t *testing.T) {
	home := filepath.Join(t.TempDir(), "home")

	manifest, err := testhome.Generate(home)
	if err != nil {
		t.Fatal(err)
	}

	want := []struct {
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
	if len(manifest.Items) != len(want) {
		t.Fatalf("manifest has %d items, want %d", len(manifest.Items), len(want))
	}
	for i, expected := range want {
		item := manifest.Items[i]
		path := filepath.Join(home, filepath.FromSlash(expected.path))
		if item.GroupID != expected.group || item.Path != path || item.Bytes != expected.bytes {
			t.Errorf("item %d = %#v, want group=%s path=%s bytes=%d", i, item, expected.group, path, expected.bytes)
		}
		info, statErr := os.Stat(path)
		if statErr != nil {
			t.Errorf("fixture path %s: %v", path, statErr)
		} else if info.Size() != expected.bytes {
			t.Errorf("fixture path %s has %d bytes, want %d", path, info.Size(), expected.bytes)
		}
	}
	if _, err := os.Stat(filepath.Join(home, ".config/mole/whitelist")); !os.IsNotExist(err) {
		t.Fatalf("fixture generated a Mole whitelist: %v", err)
	}
}

func TestCLIPrintsTheGeneratedManifest(t *testing.T) {
	home := filepath.Join(t.TempDir(), "home")
	cmd := exec.Command("go", "run", "../../tools/testhome", home)
	out, err := cmd.Output()
	if err != nil {
		t.Fatal(err)
	}
	var manifest testhome.Manifest
	if err := json.Unmarshal(out, &manifest); err != nil {
		t.Fatalf("CLI output is not a manifest: %v\n%s", err, out)
	}
	if len(manifest.Items) != 5 {
		t.Fatalf("CLI generated %d items, want 5", len(manifest.Items))
	}
}
