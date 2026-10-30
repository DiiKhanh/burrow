package space

import (
	"context"
	"errors"
	"slices"
	"testing"
)

// Reveal takes ids, as Move to Trash will (ADR 0004), so the UI never names
// a path. Revealing moves nothing, so it works outside Home too.
func TestRevealShowsAMeasuredItemInFinder(t *testing.T) {
	var revealed []string
	engine := NewEngine(Options{
		Measurer: &fakeMeasurer{measurement: overviewMeasurement()},
		Home:     home,
		Reveal:   func(path string) { revealed = append(revealed, path) },
	})
	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
	if err != nil {
		t.Fatal(err)
	}
	applications := result.Items[2]

	if err := engine.Reveal(applications.ID); err != nil {
		t.Fatal(err)
	}
	if want := []string{"/Applications"}; !slices.Equal(revealed, want) {
		t.Errorf("revealed %q, want %q", revealed, want)
	}
}

func TestRevealRefusesAnIDNoMeasureListed(t *testing.T) {
	var revealed []string
	engine := NewEngine(Options{
		Measurer: &fakeMeasurer{measurement: overviewMeasurement()},
		Home:     home,
		Reveal:   func(path string) { revealed = append(revealed, path) },
	})
	if _, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview}); err != nil {
		t.Fatal(err)
	}

	err := engine.Reveal(itemID(home + "/Documents"))
	if !errors.Is(err, ErrUnknownItem) {
		t.Errorf("error = %v, want ErrUnknownItem", err)
	}
	if len(revealed) != 0 {
		t.Errorf("revealed %q, want nothing", revealed)
	}
}

func TestRevealFailsWithoutAWayToReveal(t *testing.T) {
	engine := NewEngine(Options{Measurer: &fakeMeasurer{measurement: overviewMeasurement()}, Home: home})
	result, err := engine.Measure(context.Background(), MeasureTarget{Kind: Overview})
	if err != nil {
		t.Fatal(err)
	}

	if err := engine.Reveal(result.Items[0].ID); err == nil {
		t.Error("Reveal succeeded, want an error")
	}
}
