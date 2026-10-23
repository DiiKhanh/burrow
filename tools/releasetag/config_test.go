package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeConfig makes a project whose mygo.config.ts is source.
func writeConfig(t *testing.T, source string) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "mygo.config.ts"), []byte(source), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestAppVersionReadsTheConfig(t *testing.T) {
	tests := []struct{ name, source, want string }{
		{"object", `const name: string = "Burrow";
export default { name, version: "1.2.3" };
`, "1.2.3"},
		// It gets the command `mygo build` passes, and what it prints is not the version.
		{"function", `export default async ({ command }: { command: string }) => {
  console.log("configuring", command);
  return { version: command === "build" ? "2.0.0" : "0.0.0" };
};
`, "2.0.0"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := appVersion(context.Background(), writeConfig(t, tt.source))
			if err != nil {
				t.Fatalf("appVersion: %v", err)
			}
			if got != tt.want {
				t.Errorf("appVersion = %q, want %q", got, tt.want)
			}
		})
	}
}

// MyGo would build such an app as 0.1.0, but a release needs the version written down.
func TestAppVersionRejectsAConfigWithoutVersion(t *testing.T) {
	dir := writeConfig(t, `export default { name: "Burrow" };`)
	if got, err := appVersion(context.Background(), dir); err == nil {
		t.Errorf("appVersion = %q, want an error", got)
	}
}

func TestAppVersionReportsABrokenConfig(t *testing.T) {
	dir := writeConfig(t, `throw new Error("broken config");`)
	_, err := appVersion(context.Background(), dir)
	if err == nil || !strings.Contains(err.Error(), "broken config") {
		t.Errorf("appVersion error = %v, want one naming the config's error", err)
	}
}

func TestAppVersionReadsThisProject(t *testing.T) {
	got, err := appVersion(context.Background(), filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("appVersion: %v", err)
	}
	if !versionPattern.MatchString(got) {
		t.Errorf("appVersion = %q, want an X.Y.Z version", got)
	}
}
