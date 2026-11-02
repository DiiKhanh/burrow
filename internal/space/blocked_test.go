package space

import (
	"context"
	"slices"
	"testing"
)

func TestMeasureSaysWhyAnItemCannotBePicked(t *testing.T) {
	tests := []struct {
		name string
		path string
		want *BlockReason
	}{
		{name: "deep in Home", path: home + "/Projects/app", want: nil},
		{name: "inside a personal folder", path: home + "/Downloads/Xcode.xip", want: nil},
		{name: "Docker's data", path: home + "/Library/Containers/com.docker.docker/Data", want: nil},
		{name: "Home itself", path: home, want: ptr(BlockedTopLevel)},
		{name: "a personal folder", path: home + "/Downloads", want: ptr(BlockedTopLevel)},
		{name: "a hidden folder in Home", path: home + "/.cache", want: ptr(BlockedTopLevel)},
		{name: "a file in Home", path: home + "/notes.txt", want: ptr(BlockedTopLevel)},
		{name: "the User Library", path: home + "/Library", want: ptr(BlockedTopLevel)},
		{name: "outside Home", path: "/Applications", want: ptr(BlockedOutsideHome)},
		{name: "the system Library", path: "/Library/Caches", want: ptr(BlockedOutsideHome)},
		{name: "another home that starts like it", path: home + "-other/Projects", want: ptr(BlockedOutsideHome)},
		{name: "Clean's folder", path: home + "/Library/Logs", want: ptr(BlockedCleanHandles)},
		{name: "inside Clean's folder", path: home + "/Library/Caches/Homebrew", want: ptr(BlockedCleanHandles)},
		{name: "the Trash, in Home but Clean's", path: home + "/.Trash", want: ptr(BlockedCleanHandles)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			item := MeasuredItem{Name: "item", Path: test.path, IsDir: true}
			engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: Measurement{Items: []MeasuredItem{item}}}, Home: home})

			result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
			if err != nil {
				t.Fatal(err)
			}
			got := result.Items[0].Blocked
			if (got == nil) != (test.want == nil) || got != nil && *got != *test.want {
				t.Errorf("blocked = %v, want %v", deref(got), deref(test.want))
			}
		})
	}
}

// A large file sits anywhere below its folder, so it may be pickable in a
// folder that is not.
func TestMeasureSaysWhyALargestFileCannotBePicked(t *testing.T) {
	measurement := Measurement{LargestFiles: []MeasuredItem{
		{Name: "blob", Path: home + "/Library/Caches/com.example/blob", Bytes: 9},
		{Name: "movie.mov", Path: home + "/Library/Movies/movie.mov", Bytes: 8},
	}}
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: measurement}, Home: home})

	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Folder, Path: home + "/Library"})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"blob", "movie.mov"}; !slices.Equal(names(result.LargestFiles), want) {
		t.Fatalf("largest files = %v, want %v", names(result.LargestFiles), want)
	}
	if got := result.LargestFiles[0].Blocked; got == nil || *got != BlockedCleanHandles {
		t.Errorf("blob blocked = %v, want clean-handles", deref(got))
	}
	if got := result.LargestFiles[1].Blocked; got != nil {
		t.Errorf("movie.mov blocked = %v, want it pickable", *got)
	}
}

// The UI reads blocked as a reason or null, never a missing field.
func TestMeasureSendsAPickableItemsBlockedAsNull(t *testing.T) {
	measurement := Measurement{Items: []MeasuredItem{{Name: "app", Path: home + "/Projects/app", IsDir: true}}}
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: measurement}, Home: home})

	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Folder, Path: home + "/Projects"})
	if err != nil {
		t.Fatal(err)
	}
	if got := jsonField(t, result.Items[0], "blocked"); got != "null" {
		t.Errorf("blocked = %s, want null", got)
	}
}

func deref(reason *BlockReason) string {
	if reason == nil {
		return "pickable"
	}
	return string(*reason)
}
