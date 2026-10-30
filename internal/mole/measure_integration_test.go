//go:build integration

package mole

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/space"
	"github.com/DiiKhanh/burrow/internal/testhome"
)

// Drills down the generated Home as the UI does: each Measure opens the
// target the previous one gave the folder.
func TestIntegrationBundledAnalyzeDrillsDownTheGeneratedHome(t *testing.T) {
	home := t.TempDir()
	if _, err := testhome.Generate(home); err != nil {
		t.Fatal(err)
	}
	// testhome's files are sparse and take no blocks; this one does.
	build := filepath.Join(home, "Projects", "my app", "build")
	if err := os.MkdirAll(build, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(build, "out.bin"), bytes.Repeat([]byte{1}, 1<<20), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("my app", filepath.Join(home, "Projects", "latest")); err != nil {
		t.Fatal(err)
	}
	engine := space.NewEngine(space.Options{Measurer: NewMeasurer(bundled(t), home, quietLogger())})
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	result, err := engine.Measure(ctx, space.MeasureTarget{Kind: space.Folder, Path: home})
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Library", ".Trash"} {
		if item := itemNamed(t, result, name); item.Opens == nil {
			t.Errorf("%s opens nothing, want its folder", name)
		}
	}

	projects := itemNamed(t, result, "Projects")
	if result, err = engine.Measure(ctx, *projects.Opens); err != nil {
		t.Fatal(err)
	}
	if latest := itemNamed(t, result, "latest"); latest.IsDir || latest.Opens != nil {
		t.Errorf("symlink latest = %+v, want a link Space does not open", latest)
	}

	app := itemNamed(t, result, "my app")
	if result, err = engine.Measure(ctx, *app.Opens); err != nil {
		t.Fatal(err)
	}
	built := itemNamed(t, result, "build")
	if built.Path != build || built.Bytes < 1<<20 {
		t.Errorf("build = %+v, want %s of at least 1 MiB", built, build)
	}
	if result.TotalBytes != built.Bytes {
		t.Errorf("totalBytes = %d, want build's %d", result.TotalBytes, built.Bytes)
	}
}

func itemNamed(t *testing.T, result space.MeasureResult, name string) space.SpaceItem {
	t.Helper()
	for _, item := range result.Items {
		if item.Name == name {
			return item
		}
	}
	t.Fatalf("Measure of %s listed no %s: %+v", result.Target.Path, name, result.Items)
	return space.SpaceItem{}
}
