package space

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"testing"
	"time"
)

// fakeMeasurer returns its Measurement for every target it is asked for.
type fakeMeasurer struct {
	measurement Measurement
	err         error
	asked       []MeasureTarget
	askedAt     time.Time
}

func (f *fakeMeasurer) Measure(_ context.Context, target MeasureTarget) (Measurement, error) {
	f.asked = append(f.asked, target)
	f.askedAt = time.Now()
	return Measurement{Items: slices.Clone(f.measurement.Items), LargestFiles: slices.Clone(f.measurement.LargestFiles)}, f.err
}

const home = "/Users/test"

// overviewMeasurement is what Mole measures on a used Mac, in Mole's order:
// locations and insights mixed, insights inside the locations.
func overviewMeasurement() Measurement {
	return Measurement{Items: []MeasuredItem{
		{Name: "Home", Path: home, Bytes: 46_000_000_000, IsDir: true, ReadState: ReadComplete},
		{Name: "Docker Data", Path: home + "/Library/Containers/com.docker.docker/Data", Bytes: 21_000_000_000, IsDir: true, Insight: true, ReadState: ReadComplete},
		{Name: "User Library", Path: home + "/Library", Bytes: 73_000_000_000, IsDir: true, ReadState: ReadComplete},
		{Name: "System Library", Path: "/Library", Bytes: 6_800_000_000, IsDir: true, ReadState: ReadComplete},
		{Name: "Old Downloads (90d+)", Path: home + "/Downloads", Bytes: 3_000_000_000, IsDir: true, Insight: true, ReadState: ReadComplete},
		{Name: "Applications", Path: "/Applications", Bytes: 19_000_000_000, IsDir: true, ReadState: ReadComplete},
	}}
}

func names(items []SpaceItem) []string {
	result := make([]string, 0, len(items))
	for _, item := range items {
		result = append(result, item.Name)
	}
	return result
}

func TestMeasureOverviewListsLocationsAndInsightsApartBySize(t *testing.T) {
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: overviewMeasurement()}})

	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"User Library", "Home", "Applications", "System Library"}; !slices.Equal(names(result.Items), want) {
		t.Errorf("items = %v, want %v", names(result.Items), want)
	}
	if want := []string{"Docker Data", "Old Downloads (90d+)"}; !slices.Equal(names(result.Insights), want) {
		t.Errorf("insights = %v, want %v", names(result.Insights), want)
	}
}

// Docker Data is inside User Library: adding insights would count it twice.
func TestMeasureOverviewTotalAddsUpTheLocationsOnly(t *testing.T) {
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: overviewMeasurement()}})

	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
	if err != nil {
		t.Fatal(err)
	}
	if want := int64(144_800_000_000); result.TotalBytes != want {
		t.Errorf("totalBytes = %d, want %d", result.TotalBytes, want)
	}
}

// Measure finishes what it can read. A Space item it could not read has no
// size to show or add up, and nothing to open, since measuring it only
// fails.
func TestMeasureKeepsWhatItCouldNotReadOutOfTheTotal(t *testing.T) {
	folder := home + "/Projects"
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: Measurement{Items: []MeasuredItem{
		{Name: "locked", Path: folder + "/locked", Bytes: 9_000, IsDir: true, ReadState: ReadUnavailable},
		{Name: "mixed", Path: folder + "/mixed", Bytes: 2_000, IsDir: true, ReadState: ReadPartial},
		{Name: "notes.txt", Path: folder + "/notes.txt", Bytes: 1_000, ReadState: ReadComplete},
	}}}})

	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Folder, Path: folder})
	if err != nil {
		t.Fatal(err)
	}
	if want := int64(3_000); result.TotalBytes != want {
		t.Errorf("totalBytes = %d, want %d", result.TotalBytes, want)
	}
	if want := []string{"mixed", "notes.txt", "locked"}; !slices.Equal(names(result.Items), want) {
		t.Fatalf("items = %v, want %v", names(result.Items), want)
	}
	mixed, locked := result.Items[0], result.Items[2]
	if mixed.ReadState != ReadPartial || mixed.Bytes != 2_000 || mixed.Opens == nil {
		t.Errorf("mixed = %+v, want a partial read that keeps its size and opens", mixed)
	}
	if locked.ReadState != ReadUnavailable || locked.Bytes != 0 || locked.Opens != nil {
		t.Errorf("locked = %+v, want unavailable, with no size, opening nothing", locked)
	}
	if path, ok := engine.measuredPath(locked.ID); !ok || path != locked.Path {
		t.Errorf("id of locked resolves to %q, %v; want its path, for Reveal", path, ok)
	}
}

// measuredAt is when the Measure started: anything that changed the disk
// while it ran may be missing from it.
func TestMeasureReportsWhatAndWhenItMeasured(t *testing.T) {
	measurer := &fakeMeasurer{measurement: overviewMeasurement()}
	engine := NewEngine(Options{Measurer: measurer})
	before := time.Now()

	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
	if err != nil {
		t.Fatal(err)
	}
	if result.Target != (MeasureTarget{Kind: Overview}) {
		t.Errorf("target = %#v, want the overview", result.Target)
	}
	if !slices.Equal(measurer.asked, []MeasureTarget{{Kind: Overview}}) {
		t.Errorf("Measurer asked for %#v, want the overview once", measurer.asked)
	}
	if result.MeasuredAt.Before(before) || result.MeasuredAt.After(measurer.askedAt) {
		t.Errorf("measuredAt = %v, want when the Measure started, by %v", result.MeasuredAt, measurer.askedAt)
	}
}

func TestMeasureGivesEachItemAnIDThatStaysWithItsPath(t *testing.T) {
	tests := []struct {
		name        string
		target      MeasureTarget
		measurement Measurement
	}{
		{name: "overview", target: MeasureTarget{Kind: Overview}, measurement: overviewMeasurement()},
		{name: "folder", target: MeasureTarget{Kind: Folder, Path: home + "/Projects/app"}, measurement: folderMeasurement()},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: test.measurement}})

			first, err := engine.Measure(context.Background(), test.target)
			if err != nil {
				t.Fatal(err)
			}
			again, err := engine.Measure(context.Background(), test.target)
			if err != nil {
				t.Fatal(err)
			}
			ids := make(map[string]string)
			for _, item := range slices.Concat(first.Items, first.Insights) {
				if item.ID == "" {
					t.Fatalf("%s has no id", item.Path)
				}
				if other, taken := ids[item.ID]; taken {
					t.Fatalf("%s and %s share id %s", other, item.Path, item.ID)
				}
				ids[item.ID] = item.Path
			}
			for _, item := range slices.Concat(again.Items, again.Insights) {
				if ids[item.ID] != item.Path {
					t.Errorf("Measure again gave %s id %s, want the id it had", item.Path, item.ID)
				}
			}
		})
	}
}

func TestMeasurePassesOnTheMeasurersError(t *testing.T) {
	engine := NewEngine(Options{Measurer: &fakeMeasurer{err: context.Canceled}})

	_, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
	if !errors.Is(err, context.Canceled) {
		t.Errorf("error = %v, want context.Canceled", err)
	}
}

// folderMeasurement is what Mole measures inside one project folder.
func folderMeasurement() Measurement {
	return Measurement{
		Items: []MeasuredItem{
			{Name: "notes.txt", Path: home + "/Projects/app/notes.txt", Bytes: 4_000, ReadState: ReadComplete},
			{Name: "node_modules", Path: home + "/Projects/app/node_modules", Bytes: 900_000_000, IsDir: true, Regenerable: true, ReadState: ReadComplete},
			{Name: "build", Path: home + "/Projects/app/build", Bytes: 2_000_000_000, IsDir: true, Regenerable: true, ReadState: ReadComplete},
		},
		LargestFiles: []MeasuredItem{
			{Name: "bundle.js", Path: home + "/Projects/app/build/bundle.js", Bytes: 300_000_000, ReadState: ReadComplete},
			{Name: "app.dmg", Path: home + "/Projects/app/build/app.dmg", Bytes: 1_200_000_000, ReadState: ReadComplete},
		},
	}
}

func TestMeasureFolderListsWhatItHoldsBySize(t *testing.T) {
	measurer := &fakeMeasurer{measurement: folderMeasurement()}
	engine := NewEngine(Options{Measurer: measurer})
	target := MeasureTarget{Kind: Folder, Path: home + "/Projects/app"}

	result, err := engine.Measure(context.Background(), target)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(measurer.asked, []MeasureTarget{target}) {
		t.Errorf("Measurer asked for %#v, want %#v", measurer.asked, target)
	}
	if result.Target != target {
		t.Errorf("target = %#v, want %#v", result.Target, target)
	}
	if want := []string{"build", "node_modules", "notes.txt"}; !slices.Equal(names(result.Items), want) {
		t.Errorf("items = %v, want %v", names(result.Items), want)
	}
	if want := int64(2_900_004_000); result.TotalBytes != want {
		t.Errorf("totalBytes = %d, want %d", result.TotalBytes, want)
	}
}

// Measure only reads, so a folder outside Home is fine to measure.
func TestMeasureFolderOutsideHome(t *testing.T) {
	measurer := &fakeMeasurer{}
	engine := NewEngine(Options{Measurer: measurer})

	if _, err := engine.Measure(context.Background(), MeasureTarget{Kind: Folder, Path: "/Applications"}); err != nil {
		t.Fatal(err)
	}
	if len(measurer.asked) != 1 {
		t.Errorf("Measurer asked for %#v, want /Applications once", measurer.asked)
	}
}

func TestMeasureRefusesATargetItCannotTrust(t *testing.T) {
	tests := []struct {
		name   string
		target MeasureTarget
	}{
		{name: "unknown kind", target: MeasureTarget{Kind: "everything"}},
		{name: "folder without a path", target: MeasureTarget{Kind: Folder}},
		{name: "relative path", target: MeasureTarget{Kind: Folder, Path: "Users/test/Projects"}},
		{name: "dot-dot", target: MeasureTarget{Kind: Folder, Path: home + "/Projects/../../other"}},
		{name: "trailing dot-dot", target: MeasureTarget{Kind: Folder, Path: home + "/.."}},
		{name: "not in clean form", target: MeasureTarget{Kind: Folder, Path: home + "//Projects/"}},
		{name: "control character", target: MeasureTarget{Kind: Folder, Path: home + "/Pro\njects"}},
		{name: "invalid UTF-8", target: MeasureTarget{Kind: Folder, Path: home + "/\xff"}},
		{name: "overview with a path", target: MeasureTarget{Kind: Overview, Path: home}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			measurer := &fakeMeasurer{measurement: folderMeasurement()}
			engine := NewEngine(Options{Measurer: measurer})

			_, err := engine.Measure(context.Background(), test.target)
			if !errors.Is(err, ErrInvalidTarget) {
				t.Errorf("error = %v, want ErrInvalidTarget", err)
			}
			if len(measurer.asked) != 0 {
				t.Errorf("Measurer asked for %#v, want nothing measured", measurer.asked)
			}
		})
	}
}

func TestMeasureGivesEachFolderTheTargetThatOpensIt(t *testing.T) {
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: folderMeasurement()}})

	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Folder, Path: home + "/Projects/app"})
	if err != nil {
		t.Fatal(err)
	}
	opens := make(map[string]*MeasureTarget)
	for _, item := range result.Items {
		opens[item.Name] = item.Opens
	}
	for _, folder := range []string{"build", "node_modules"} {
		want := MeasureTarget{Kind: Folder, Path: home + "/Projects/app/" + folder}
		if opens[folder] == nil || *opens[folder] != want {
			t.Errorf("%s opens %#v, want %#v", folder, opens[folder], want)
		}
	}
	if opens["notes.txt"] != nil {
		t.Errorf("notes.txt opens %#v, want a file to open nothing", opens["notes.txt"])
	}
}

func TestMeasureOverviewOpensEveryLocationAndInsight(t *testing.T) {
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: overviewMeasurement()}})

	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range slices.Concat(result.Items, result.Insights) {
		want := MeasureTarget{Kind: Folder, Path: item.Path}
		if item.Opens == nil || *item.Opens != want {
			t.Errorf("%s opens %#v, want %#v", item.Name, item.Opens, want)
		}
	}
}

// MoveToTrash takes ids only, so the engine must know every Space item the
// results of this session list, and nothing else.
func TestMeasureRemembersEveryItemItListedThisSession(t *testing.T) {
	measurer := &fakeMeasurer{measurement: overviewMeasurement()}
	engine := NewEngine(Options{Measurer: measurer})
	overview, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
	if err != nil {
		t.Fatal(err)
	}
	measurer.measurement = folderMeasurement()
	folder, err := engine.Measure(context.Background(), MeasureTarget{Kind: Folder, Path: home + "/Projects/app"})
	if err != nil {
		t.Fatal(err)
	}

	for _, item := range slices.Concat(overview.Items, overview.Insights, folder.Items) {
		if path, ok := engine.measuredPath(item.ID); !ok || path != item.Path {
			t.Errorf("id of %s resolves to %q, %v; want its path", item.Path, path, ok)
		}
	}
	if path, ok := engine.measuredPath(itemID(home + "/Documents")); ok {
		t.Errorf("an id no Measure listed resolves to %q", path)
	}
}

func TestMeasureThatFailsRemembersNothing(t *testing.T) {
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: folderMeasurement(), err: context.Canceled}})

	if _, err := engine.Measure(context.Background(), MeasureTarget{Kind: Folder, Path: home + "/Projects/app"}); err == nil {
		t.Fatal("Measure succeeded, want the Measurer's error")
	}
	if path, ok := engine.measuredPath(itemID(home + "/Projects/app/build")); ok {
		t.Errorf("a failed Measure's item resolves to %q", path)
	}
}

// ADR 0004: only items in a current result count. Measure again replaces
// what that folder listed; other folders' results stay current.
func TestMeasureAgainForgetsWhatTheFolderNoLongerHolds(t *testing.T) {
	measurer := &fakeMeasurer{measurement: overviewMeasurement()}
	engine := NewEngine(Options{Measurer: measurer})
	if _, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview}); err != nil {
		t.Fatal(err)
	}
	app := MeasureTarget{Kind: Folder, Path: home + "/Projects/app"}
	measurer.measurement = folderMeasurement()
	if _, err := engine.Measure(context.Background(), app); err != nil {
		t.Fatal(err)
	}
	measurer.measurement = Measurement{Items: folderMeasurement().Items[1:]}
	if _, err := engine.Measure(context.Background(), app); err != nil {
		t.Fatal(err)
	}

	if path, ok := engine.measuredPath(itemID(home + "/Projects/app/notes.txt")); ok {
		t.Errorf("an item Measure again left out resolves to %q", path)
	}
	for _, path := range []string{home + "/Projects/app/build", home + "/Library"} {
		if _, ok := engine.measuredPath(itemID(path)); !ok {
			t.Errorf("%s, still in a current result, no longer resolves", path)
		}
	}
}

// Largest files lie anywhere below the folder: they open nothing and add
// nothing to the total, which their folders already hold.
func TestMeasureFolderListsItsLargestFilesBySize(t *testing.T) {
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: folderMeasurement()}})

	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Folder, Path: home + "/Projects/app"})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"app.dmg", "bundle.js"}; !slices.Equal(names(result.LargestFiles), want) {
		t.Errorf("largest files = %v, want %v", names(result.LargestFiles), want)
	}
	for _, file := range result.LargestFiles {
		if file.IsDir || file.Opens != nil {
			t.Errorf("%s = %+v, want a file that opens nothing", file.Name, file)
		}
		if path, ok := engine.measuredPath(file.ID); !ok || path != file.Path {
			t.Errorf("id of %s resolves to %q, %v; want its path", file.Path, path, ok)
		}
	}
	if want := int64(2_900_004_000); result.TotalBytes != want {
		t.Errorf("totalBytes = %d, want %d", result.TotalBytes, want)
	}
}

// The UI tells a folder's result from the overview's by largestFiles: a
// folder always has it, even empty, and the overview never does.
func TestMeasureSendsLargestFilesForAFolderOnly(t *testing.T) {
	tests := []struct {
		name   string
		target MeasureTarget
		want   string
	}{
		{name: "overview", target: MeasureTarget{Kind: Overview}, want: ""},
		{name: "folder", target: MeasureTarget{Kind: Folder, Path: home + "/Projects/empty"}, want: "[]"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			engine := NewEngine(Options{Measurer: &fakeMeasurer{}})

			result, err := engine.Measure(context.Background(), test.target)
			if err != nil {
				t.Fatal(err)
			}
			if got := jsonField(t, result, "largestFiles"); got != test.want {
				t.Errorf("largestFiles = %q, want %q", got, test.want)
			}
		})
	}
}

// jsonField is field of value as the UI receives it, "" when it is left out.
func jsonField(t *testing.T, value any, field string) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatal(err)
	}
	return string(fields[field])
}
