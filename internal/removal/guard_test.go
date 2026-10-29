package removal_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/DiiKhanh/burrow/internal/removal"
)

// belowFirstLevel is the rule Space adds: never Home's own folders.
func belowFirstLevel(rel string) bool {
	return strings.Contains(rel, "/")
}

func TestGuardAppliesTheRulesOfItsCaller(t *testing.T) {
	home := t.TempDir()
	documents := mkdir(t, home, "Documents")
	projects := mkdir(t, home, "Projects")
	old := mkdir(t, home, "Projects/old")
	caches := mkdir(t, home, "Library/Caches")
	link := filepath.Join(caches, "projects-link")
	if err := os.Symlink(projects, link); err != nil {
		t.Fatal(err)
	}
	withRule := newGuard(t, home, belowFirstLevel)
	withoutRule := newGuard(t, home)
	allowAll := newGuard(t, home, func(string) bool { return true })

	for _, tc := range []struct {
		name  string
		guard *removal.Guard
		path  string
		want  removal.SkipReason
	}{
		{"the rule refuses a path as given", withRule, projects, removal.Protected},
		{"the rule refuses a path once its symlinks resolve", withRule, link, removal.Protected},
		{"the rule lets other paths pass", withRule, old, ""},
		{"a Guard without the rule lets the path pass", withoutRule, projects, ""},
		{"a rule cannot let a protected path pass", allowAll, documents, removal.Protected},
		{"a rule cannot let Home itself pass", allowAll, home, removal.Protected},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reason, ok := tc.guard.Check(tc.path)
			if reason != tc.want || ok != (tc.want == "") {
				t.Fatalf("Check(%s) = %q, %v, want %q", tc.path, reason, ok, tc.want)
			}
		})
	}
}

func newGuard(t *testing.T, home string, rules ...removal.Rule) *removal.Guard {
	t.Helper()
	guard, err := removal.NewGuard(home, rules...)
	if err != nil {
		t.Fatal(err)
	}
	return guard
}

func mkdir(t *testing.T, home, rel string) string {
	t.Helper()
	path := filepath.Join(home, rel)
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}
