package main

import "testing"

func TestParseTagAcceptsTheAppVersion(t *testing.T) {
	tests := []struct {
		name, tag string
		want      release
	}{
		{"release", "v0.1.0", release{Version: "0.1.0", Prerelease: false}},
		{"pre-release", "v0.1.0-rc.1", release{Version: "0.1.0-rc.1", Prerelease: true}},
		{"pre-release with hyphens", "v0.1.0-beta-2", release{Version: "0.1.0-beta-2", Prerelease: true}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseTag(tt.tag, "0.1.0")
			if err != nil {
				t.Fatalf("parseTag(%q, 0.1.0): %v", tt.tag, err)
			}
			if got != tt.want {
				t.Errorf("parseTag(%q, 0.1.0) = %+v, want %+v", tt.tag, got, tt.want)
			}
		})
	}
}

func TestParseTagRejects(t *testing.T) {
	tests := []struct{ name, tag, appVersion string }{
		{"another minor", "v0.2.0", "0.1.0"},
		{"another patch", "v0.1.1", "0.1.0"},
		{"pre-release of another version", "v0.2.0-rc.1", "0.1.0"},
		{"leading zero", "v00.1.0", "0.1.0"},
		{"no v", "0.1.0", "0.1.0"},
		{"two parts", "v0.1", "0.1.0"},
		{"another prefix", "release-0.1.0", "0.1.0"},
		{"empty pre-release", "v0.1.0-", "0.1.0"},
		{"empty identifier", "v0.1.0-rc..1", "0.1.0"},
		{"trailing dot", "v0.1.0-rc.1.", "0.1.0"},
		{"build metadata", "v0.1.0+build.5", "0.1.0"},
		{"space", "v0.1.0-rc 1", "0.1.0"},
		// The app's own version is X.Y.Z: a pre-release comes from the tag alone.
		{"pre-release app version", "v0.1.0-rc.1", "0.1.0-rc.1"},
		{"empty app version", "v", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got, err := parseTag(tt.tag, tt.appVersion); err == nil {
				t.Errorf("parseTag(%q, %q) = %+v, want an error", tt.tag, tt.appVersion, got)
			}
		})
	}
}

func TestParseTagNamesAnAppVersionThatIsNotXYZ(t *testing.T) {
	_, err := parseTag("v0.1.0-rc.1", "0.1.0-rc.1")
	want := "version 0.1.0-rc.1 in mygo.config.ts is not X.Y.Z"
	if err == nil || err.Error() != want {
		t.Errorf("parseTag error = %v, want %q", err, want)
	}
}
