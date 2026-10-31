package space

import (
	"context"
	"slices"
	"testing"
)

func TestMeasureTagsEachItem(t *testing.T) {
	tests := []struct {
		name string
		item MeasuredItem
		want []Tag
	}{
		{name: "plain folder", item: MeasuredItem{Path: home + "/Projects", IsDir: true}, want: []Tag{}},
		{name: "insight", item: MeasuredItem{Path: home + "/Library/Containers/com.docker.docker/Data", IsDir: true, Insight: true}, want: []Tag{TagInsight}},
		{name: "regenerable", item: MeasuredItem{Path: home + "/Projects/app/node_modules", IsDir: true, Regenerable: true}, want: []Tag{TagRegenerable}},
		{name: "insight Clean empties", item: MeasuredItem{Path: home + "/Library/Caches/Homebrew", IsDir: true, Insight: true}, want: []Tag{TagInsight, TagCleanHandles}},
		{name: "Clean's folder itself", item: MeasuredItem{Path: home + "/Library/Logs", IsDir: true, Insight: true}, want: []Tag{TagInsight, TagCleanHandles}},
		{name: "saved application state", item: MeasuredItem{Path: home + "/Library/Saved Application State/com.apple.Terminal.savedState", IsDir: true}, want: []Tag{TagCleanHandles}},
		{name: "in the Trash", item: MeasuredItem{Path: home + "/.Trash/old.zip"}, want: []Tag{TagCleanHandles}},
		{name: "case differs, as APFS allows", item: MeasuredItem{Path: home + "/library/caches/pip", IsDir: true}, want: []Tag{TagCleanHandles}},
		{name: "name starts like Clean's folder", item: MeasuredItem{Path: home + "/Library/CachesBackup", IsDir: true}, want: []Tag{}},
		{name: "above Clean's folders", item: MeasuredItem{Path: home + "/Library", IsDir: true}, want: []Tag{}},
		{name: "system caches outside Home", item: MeasuredItem{Path: "/Library/Caches", IsDir: true}, want: []Tag{}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			test.item.Name = "item"
			engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: Measurement{Items: []MeasuredItem{test.item}}}, Home: home})

			result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
			if err != nil {
				t.Fatal(err)
			}
			items := slices.Concat(result.Items, result.Insights)
			if len(items) != 1 {
				t.Fatalf("items = %+v, want one", items)
			}
			if !slices.Equal(items[0].Tags, test.want) {
				t.Errorf("tags = %q, want %q", items[0].Tags, test.want)
			}
		})
	}
}

// A large file deep inside Clean's ground is one Clean removes too.
func TestMeasureTagsLargestFilesClean(t *testing.T) {
	measurement := Measurement{LargestFiles: []MeasuredItem{
		{Name: "blob", Path: home + "/Library/Caches/com.example/blob", Bytes: 9},
		{Name: "movie.mov", Path: home + "/Library/Movies/movie.mov", Bytes: 8},
	}}
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: measurement}, Home: home})

	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Folder, Path: home + "/Library"})
	if err != nil {
		t.Fatal(err)
	}
	tags := make(map[string][]Tag)
	for _, file := range result.LargestFiles {
		tags[file.Name] = file.Tags
	}
	if want := []Tag{TagCleanHandles}; !slices.Equal(tags["blob"], want) {
		t.Errorf("blob tags = %q, want %q", tags["blob"], want)
	}
	if len(tags["movie.mov"]) != 0 {
		t.Errorf("movie.mov tags = %q, want none", tags["movie.mov"])
	}
}

// The UI reads tags as a list, never null.
func TestMeasureSendsTagsAsAList(t *testing.T) {
	measurement := Measurement{Items: []MeasuredItem{{Name: "Projects", Path: home + "/Projects", IsDir: true}}}
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: measurement}, Home: home})

	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Folder, Path: home})
	if err != nil {
		t.Fatal(err)
	}
	if got := jsonField(t, result.Items[0], "tags"); got != "[]" {
		t.Errorf("tags = %s, want []", got)
	}
}
