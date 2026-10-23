//go:build smoke

package smoke

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/testhome"
)

// The timeouts are generous for a cold CI runner: Scan runs the bundled Mole.
const (
	loadTimeout  = time.Minute
	scanTimeout  = 3 * time.Minute
	cleanTimeout = time.Minute
)

// groupNames are the junk groups of the fixture as Review names them.
var groupNames = map[clean.JunkGroupID]string{
	clean.LogsSavedState: "Logs & Saved State",
	clean.Trash:          "Trash",
}

// selectedGroup is the one junk group the test cleans. It Deletes, as the
// other fixture group does: Move to Trash would use the real Trash, which a
// fake HOME does not redirect.
const selectedGroup = clean.LogsSavedState

// Scripts run in the page as the body of an async function. %s takes a
// JSON-encoded argument.
const (
	clickButtonScript = `
const button = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === %s);
if (!button || button.disabled) return null;
button.click();
return true;`
	reviewGroupsScript = `
const list = document.querySelector('ul[aria-label="Junk groups"]');
if (!list) return null;
return [...list.querySelectorAll('[role="checkbox"]')].map((box) => ({
  name: box.getAttribute("aria-label"),
  checked: box.getAttribute("aria-checked"),
  disabled: box.disabled,
  movesToTrash: box.closest("li").textContent.includes("moves to Trash"),
}));`
	toggleGroupScript = `
const box = [...document.querySelectorAll('ul[aria-label="Junk groups"] [role="checkbox"]')]
  .find((b) => b.getAttribute("aria-label") === %s);
if (!box) throw new Error("no checkbox for the junk group");
box.click();
return true;`
	cleanEndScript = `
const summary = document.querySelector('[aria-label="Clean summary"]');
if (summary) return { summary: summary.textContent };
const failed = document.body.textContent.includes("Clean could not finish");
return failed ? { failed: document.querySelector("main").textContent } : null;`
)

// cleanEnd is how Clean ended: the Done summary, or the page after a failure.
type cleanEnd struct {
	Summary string `json:"summary"`
	Failed  string `json:"failed"`
}

type reviewGroup struct {
	Name         string `json:"name"`
	Checked      string `json:"checked"`
	Disabled     bool   `json:"disabled"`
	MovesToTrash bool   `json:"movesToTrash"`
}

func TestCleanRemovesOnlyTheSelectedDeleteGroupFromTheFixture(t *testing.T) {
	manifest := generatedHome(t)
	selected, kept := splitItems(t, manifest)
	app := startDrivenApp(t, manifest.Home)

	var ok bool
	app.waitFor("the Start scan button", loadTimeout, &ok, clickButtonScript, "Start scan")
	var groups []reviewGroup
	app.waitFor("Review", scanTimeout, &groups, reviewGroupsScript)
	selectOnly(t, app, groups, groupNames[selectedGroup])

	before := snapshot(t, manifest.Home)
	app.eval(&ok, clickButtonScript, "Clean 1 item →")
	if !ok {
		t.Fatal(`Review has no enabled "Clean 1 item →" button`)
	}
	var end cleanEnd
	app.waitFor("Clean to end", cleanTimeout, &end, cleanEndScript)

	if end.Failed != "" {
		t.Fatalf("Clean failed; the page shows %q", end.Failed)
	}
	if !strings.Contains(end.Summary, "1 removed · 0 skipped") || strings.Contains(end.Summary, "moved to Trash") {
		t.Errorf("Clean summary = %q, want 1 removed, 0 skipped and nothing moved to Trash", end.Summary)
	}
	if _, err := os.Lstat(selected.Path); !os.IsNotExist(err) {
		t.Errorf("selected item %s is still in the fixture (lstat error %v)", selected.Path, err)
	}
	for _, item := range kept {
		if bytes := treeBytes(t, item.Path); bytes != item.Bytes {
			t.Errorf("unselected item %s has %d bytes, want it untouched with %d", item.Path, bytes, item.Bytes)
		}
	}
	for path := range before {
		if within(path, selected.Path) {
			continue
		}
		if _, err := os.Lstat(path); err != nil {
			t.Errorf("Clean removed %s, which was not selected: %v", path, err)
		}
	}
	assertHistory(t, manifest.Home, selected)
}

// splitItems returns the fixture item of selectedGroup and the others.
func splitItems(t *testing.T, manifest testhome.Manifest) (testhome.Item, []testhome.Item) {
	t.Helper()
	var selected []testhome.Item
	var kept []testhome.Item
	for _, item := range manifest.Items {
		if _, named := groupNames[item.GroupID]; !named {
			t.Fatalf("the fixture has an item of junk group %s, which this test does not name", item.GroupID)
		}
		if item.GroupID == selectedGroup {
			selected = append(selected, item)
		} else {
			kept = append(kept, item)
		}
	}
	if len(selected) != 1 || len(kept) == 0 {
		t.Fatalf("the fixture has %d items of %s and %d others, want 1 and some", len(selected), selectedGroup, len(kept))
	}
	return selected[0], kept
}

// selectOnly leaves the checkbox of the junk group named name checked and
// every other one unchecked. It never checks a Move to Trash group.
func selectOnly(t *testing.T, app *page, groups []reviewGroup, name string) {
	t.Helper()
	found := false
	for _, group := range groups {
		want := group.Name == name
		found = found || want
		if want && (group.MovesToTrash || group.Disabled) {
			t.Fatalf("junk group %q moves to Trash or is locked: %+v", name, group)
		}
		if (group.Checked == "true") == want {
			continue
		}
		var ok bool
		app.eval(&ok, toggleGroupScript, group.Name)
		if group.Checked == "mixed" {
			// Clicking a partly selected group selects all of it.
			app.eval(&ok, toggleGroupScript, group.Name)
		}
	}
	if !found {
		t.Fatalf("Review does not list junk group %q: %+v", name, groups)
	}
	app.eval(&groups, reviewGroupsScript)
	for _, group := range groups {
		if want := group.Name == name; (group.Checked == "true") != want {
			t.Fatalf("junk group %q is %s after selecting only %q", group.Name, group.Checked, name)
		}
	}
}

// snapshot lists every path in the tree under root.
func snapshot(t *testing.T, root string) map[string]bool {
	t.Helper()
	paths := make(map[string]bool)
	err := filepath.WalkDir(root, func(path string, _ fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		paths[path] = true
		return nil
	})
	if err != nil {
		t.Fatalf("listing %s: %v", root, err)
	}
	return paths
}

// assertHistory checks that Clean logged exactly one Delete: the selected item.
func assertHistory(t *testing.T, home string, selected testhome.Item) {
	t.Helper()
	history, err := os.ReadFile(filepath.Join(home, "Library/Application Support/Burrow/history.jsonl"))
	if err != nil {
		t.Fatalf("reading the Clean history in the fixture: %v", err)
	}
	type historyItem struct {
		Path    string `json:"path"`
		Method  string `json:"method"`
		Outcome string `json:"outcome"`
	}
	var items []historyItem
	for _, line := range strings.Split(strings.TrimSpace(string(history)), "\n") {
		var run struct {
			Items []historyItem `json:"items"`
		}
		if err := json.Unmarshal([]byte(line), &run); err != nil {
			t.Fatalf("history line %q: %v", line, err)
		}
		items = append(items, run.Items...)
	}
	want := historyItem{Path: selected.Path, Method: string(clean.Delete), Outcome: "removed"}
	if len(items) != 1 || items[0] != want {
		t.Fatalf("Clean history = %+v, want only %+v", items, want)
	}
}

func within(path, root string) bool {
	return path == root || strings.HasPrefix(path, root+string(filepath.Separator))
}

func treeBytes(t *testing.T, root string) int64 {
	t.Helper()
	var total int64
	err := filepath.WalkDir(root, func(_ string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode().IsRegular() {
			total += info.Size()
		}
		return nil
	})
	if err != nil {
		t.Errorf("measuring %s: %v", root, err)
		return -1
	}
	return total
}
