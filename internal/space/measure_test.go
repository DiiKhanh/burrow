package space

import (
	"context"
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
}

func (f *fakeMeasurer) Measure(_ context.Context, target MeasureTarget) (Measurement, error) {
	f.asked = append(f.asked, target)
	return Measurement{Items: slices.Clone(f.measurement.Items)}, f.err
}

const home = "/Users/test"

// overviewMeasurement is what Mole measures on a used Mac, in Mole's order:
// locations and insights mixed, insights inside the locations.
func overviewMeasurement() Measurement {
	return Measurement{Items: []MeasuredItem{
		{Name: "Home", Path: home, Bytes: 46_000_000_000, IsDir: true},
		{Name: "Docker Data", Path: home + "/Library/Containers/com.docker.docker/Data", Bytes: 21_000_000_000, IsDir: true, Insight: true},
		{Name: "User Library", Path: home + "/Library", Bytes: 73_000_000_000, IsDir: true},
		{Name: "System Library", Path: "/Library", Bytes: 6_800_000_000, IsDir: true},
		{Name: "Old Downloads (90d+)", Path: home + "/Downloads", Bytes: 3_000_000_000, IsDir: true, Insight: true},
		{Name: "Applications", Path: "/Applications", Bytes: 19_000_000_000, IsDir: true},
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
	if result.MeasuredAt.Before(before) || result.MeasuredAt.After(time.Now()) {
		t.Errorf("measuredAt = %v, want during the Measure", result.MeasuredAt)
	}
}

func TestMeasureGivesEachItemAnIDThatStaysWithItsPath(t *testing.T) {
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: overviewMeasurement()}})

	first, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
	if err != nil {
		t.Fatal(err)
	}
	again, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
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
}

func TestMeasureRefusesATargetItDoesNotKnow(t *testing.T) {
	measurer := &fakeMeasurer{measurement: overviewMeasurement()}
	engine := NewEngine(Options{Measurer: measurer})

	_, err := engine.Measure(context.Background(), MeasureTarget{Kind: "everything"})
	if !errors.Is(err, ErrInvalidTarget) {
		t.Errorf("error = %v, want ErrInvalidTarget", err)
	}
	if len(measurer.asked) != 0 {
		t.Errorf("Measurer asked for %#v, want nothing measured", measurer.asked)
	}
}

func TestMeasurePassesOnTheMeasurersError(t *testing.T) {
	engine := NewEngine(Options{Measurer: &fakeMeasurer{err: context.Canceled}})

	_, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
	if !errors.Is(err, context.Canceled) {
		t.Errorf("error = %v, want context.Canceled", err)
	}
}
