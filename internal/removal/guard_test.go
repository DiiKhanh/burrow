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

// A dangling symlink is on disk, so it is not already gone, and where it
// points cannot be checked, so it stays.
func TestGuardRefusesADanglingSymlink(t *testing.T) {
	home := t.TempDir()
	link := filepath.Join(mkdir(t, home, "Projects"), "dangling")
	if err := os.Symlink(filepath.Join(home, "nowhere"), link); err != nil {
		t.Fatal(err)
	}

	if reason, ok := newGuard(t, home).Check(link); ok || reason != removal.Protected {
		t.Fatalf("Check = %q, %v, want it protected", reason, ok)
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

// A picked item is one the user chose by hand, and it goes to the Trash: what
// lies inside a personal folder may go, unlike a junk item, but the folder
// and everything else on the protected list may not.
func TestPickedGuardLetsThroughOnlyWhatLiesInsideAPersonalFolder(t *testing.T) {
	home := t.TempDir()
	download := mkdir(t, home, "Downloads/Xcode.xip")
	movie := mkdir(t, home, "Movies/2025/trip.mov")
	mkdir(t, home, "documents")
	lowerCase := mkdir(t, home, "documents/taxes")
	guard, err := removal.NewPickedGuard(home, func(string) bool { return true })
	if err != nil {
		t.Fatal(err)
	}

	for _, tc := range []struct {
		name string
		path string
		want removal.SkipReason
	}{
		{"directly in a personal folder", download, ""},
		{"deeper in a personal folder", movie, ""},
		{"case differs, as APFS allows", lowerCase, ""},
		{"the personal folder itself", mkdir(t, home, "Downloads"), removal.Protected},
		{"its name in another case", mkdir(t, home, "documents"), removal.Protected},
		{"a folder that keeps everything inside", mkdir(t, home, ".ssh/keys"), removal.Protected},
		{"inside a Library folder on the list", mkdir(t, home, "Library/Mail/V10"), removal.Protected},
		{"above a Library folder on the list", mkdir(t, home, "Library/Application Support"), removal.Protected},
		{"Burrow's own data", mkdir(t, home, "Library/Application Support/Burrow/x"), removal.Protected},
		{"Home itself", home, removal.Protected},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reason, ok := guard.Check(tc.path)
			if reason != tc.want || ok != (tc.want == "") {
				t.Fatalf("Check(%s) = %q, %v, want %q", tc.path, reason, ok, tc.want)
			}
		})
	}
}

// Clean removes what Mole proposes, some of it for good: nothing inside a
// personal folder is ever junk.
func TestGuardKeepsWhatLiesInsideAPersonalFolder(t *testing.T) {
	home := t.TempDir()
	guard := newGuard(t, home)

	if reason, ok := guard.Check(mkdir(t, home, "Downloads/Xcode.xip")); ok || reason != removal.Protected {
		t.Fatalf("Check = %q, %v, want it protected", reason, ok)
	}
}
