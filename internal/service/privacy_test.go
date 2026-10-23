package service

import (
	"errors"
	"slices"
	"testing"
)

func TestOpenFullDiskAccessOpensItsPaneDirectly(t *testing.T) {
	var opened []string
	privacy := NewPrivacy(func(url string) error {
		opened = append(opened, url)
		return nil
	})

	pane, err := privacy.OpenFullDiskAccess()
	if err != nil {
		t.Fatal(err)
	}
	if pane != FullDiskAccessPane {
		t.Fatalf("pane = %q, want %q", pane, FullDiskAccessPane)
	}
	want := []string{"x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"}
	if !slices.Equal(opened, want) {
		t.Fatalf("opened %q, want %q", opened, want)
	}
}

func TestOpenFullDiskAccessFallsBackToPrivacyAndSecurity(t *testing.T) {
	var opened []string
	privacy := NewPrivacy(func(url string) error {
		opened = append(opened, url)
		if len(opened) == 1 {
			return errors.New("no application can open it")
		}
		return nil
	})

	pane, err := privacy.OpenFullDiskAccess()
	if err != nil {
		t.Fatal(err)
	}
	if pane != PrivacySecurityPane {
		t.Fatalf("pane = %q, want %q", pane, PrivacySecurityPane)
	}
	if len(opened) != 2 || opened[1] != "x-apple.systempreferences:com.apple.preference.security" {
		t.Fatalf("opened %q, want the Privacy & Security pane second", opened)
	}
}

func TestOpenFullDiskAccessFailsWhenSystemSettingsWillNotOpen(t *testing.T) {
	refused := errors.New("no application can open it")
	privacy := NewPrivacy(func(string) error { return refused })

	if _, err := privacy.OpenFullDiskAccess(); !errors.Is(err, refused) {
		t.Fatalf("error = %v, want %v", err, refused)
	}
}
