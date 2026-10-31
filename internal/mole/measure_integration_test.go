//go:build integration

package mole

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"slices"
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
	// Mole looks for large files outside folders it folds, such as build.
	media := filepath.Join(home, "Projects", "my app", "media")
	if err := os.MkdirAll(media, 0o755); err != nil {
		t.Fatal(err)
	}
	demo := filepath.Join(media, "demo.mov")
	if err := os.WriteFile(demo, bytes.Repeat([]byte{2}, 2<<20), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("my app", filepath.Join(home, "Projects", "latest")); err != nil {
		t.Fatal(err)
	}
	engine := space.NewEngine(space.Options{Measurer: NewMeasurer(bundled(t), home, quietLogger()), Home: home})
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
	if trash := itemNamed(t, result, ".Trash"); !slices.Contains(trash.Tags, space.TagCleanHandles) {
		t.Errorf(".Trash tags = %q, want %q", trash.Tags, space.TagCleanHandles)
	}
	if !slices.ContainsFunc(result.LargestFiles, func(file space.SpaceItem) bool { return file.Path == demo }) {
		t.Errorf("largest files of Home = %+v, want %s among them", result.LargestFiles, demo)
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
	if !slices.Contains(built.Tags, space.TagRegenerable) {
		t.Errorf("build tags = %q, want %q", built.Tags, space.TagRegenerable)
	}
	// testhome's other files take no blocks.
	if want := built.Bytes + itemNamed(t, result, "media").Bytes; result.TotalBytes != want {
		t.Errorf("totalBytes = %d, want build's and media's %d", result.TotalBytes, want)
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
