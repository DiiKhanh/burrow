package mole

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// fakeBundle writes a bundle with executable mo, status and analyze into dir.
func fakeBundle(t *testing.T, dir string) {
	t.Helper()
	for _, path := range []string{MoPath, StatusPath, AnalyzePath} {
		full := filepath.Join(dir, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte("#!/bin/sh\n"), 0o755); err != nil {
			t.Fatal(err)
		}
	}
}

func TestLocateFindsTheBundleInsideTheApp(t *testing.T) {
	resources := t.TempDir() // Contents/Resources: platform directories merged
	fakeBundle(t, filepath.Join(resources, "mole"))

	b, err := Locate(resources)
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(resources, "mole", "mo"); b.Mo() != want {
		t.Errorf("Mo() = %s, want %s", b.Mo(), want)
	}
	if want := filepath.Join(resources, "mole", "bin", "status-go"); b.Status() != want {
		t.Errorf("Status() = %s, want %s", b.Status(), want)
	}
	if want := filepath.Join(resources, "mole", "bin", "analyze-go"); b.Analyze() != want {
		t.Errorf("Analyze() = %s, want %s", b.Analyze(), want)
	}
}

func TestLocateFindsTheBundleInTheProjectResources(t *testing.T) {
	resources := t.TempDir() // go run / go test: platform directories as they are
	platform := runtime.GOOS + "-" + runtime.GOARCH
	fakeBundle(t, filepath.Join(resources, platform, "mole"))

	b, err := Locate(resources)
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(resources, platform, "mole", "mo"); b.Mo() != want {
		t.Errorf("Mo() = %s, want %s", b.Mo(), want)
	}
}

func TestLocateFailsWithoutACompleteBundle(t *testing.T) {
	cases := map[string]func(t *testing.T, resources string){
		"nothing": func(*testing.T, string) {},
		"no status": func(t *testing.T, resources string) {
			fakeBundle(t, filepath.Join(resources, "mole"))
			if err := os.Remove(filepath.Join(resources, "mole", StatusPath)); err != nil {
				t.Fatal(err)
			}
		},
		"no analyze": func(t *testing.T, resources string) {
			fakeBundle(t, filepath.Join(resources, "mole"))
			if err := os.Remove(filepath.Join(resources, "mole", AnalyzePath)); err != nil {
				t.Fatal(err)
			}
		},
		"mo not executable": func(t *testing.T, resources string) {
			fakeBundle(t, filepath.Join(resources, "mole"))
			if err := os.Chmod(filepath.Join(resources, "mole", MoPath), 0o644); err != nil {
				t.Fatal(err)
			}
		},
	}
	for name, setup := range cases {
		t.Run(name, func(t *testing.T) {
			resources := t.TempDir()
			setup(t, resources)
			if _, err := Locate(resources); !errors.Is(err, ErrNotBundled) {
				t.Errorf("err = %v, want ErrNotBundled", err)
			}
		})
	}
}
