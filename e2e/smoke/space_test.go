//go:build smoke

package smoke

import (
	"bytes"
	"debug/buildinfo"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/DiiKhanh/burrow/internal/removal"
	"github.com/DiiKhanh/burrow/internal/removal/removaltest"
)

// testBuild is the app as `bun run build:smoke` makes it, with the smoke
// build tag: its Move to Trash moves into the .Trash of the HOME it runs
// with. The shipped app moves into the real Trash, which a fake HOME does
// not redirect.
var testBuild = appBinary{path: "../../build/smoke/darwin-arm64/Burrow.app/Contents/MacOS/Burrow", buildScript: "build:smoke"}

// The overview Measure reads all of /Applications and /Library on a cold
// CI runner.
const (
	measureTimeout = 3 * time.Minute
	trashTimeout   = time.Minute
)

// spaceFile is a file the test adds to the generated Home for Space to
// Measure. Its bytes are written, unlike testhome's sparse files, so the
// analyzer counts them.
type spaceFile struct {
	path  string
	bytes int
}

// The Projects folder of the generated Home: the test picks "old app" and
// "demo.mov", and keeps "keep.bin".
var spaceFiles = []spaceFile{
	{"Projects/old app/out.bin", 1 << 20},
	{"Projects/demo.mov", 2 << 20},
	{"Projects/keep.bin", 1 << 20},
}

var pickedNames = []string{"old app", "demo.mov"}

// Scripts run in the page as the body of an async function. %s takes a
// JSON-encoded argument.
const (
	// Radix tabs switch on mousedown, which click() does not send.
	openTabScript = `
const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === %s);
if (!tab) return null;
tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
return tab.getAttribute("aria-selected") === "true" || null;`
	clickLabeledScript = `
const button = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === %s);
if (!button || button.disabled) return null;
button.click();
return true;`
	// The checkbox of name in the Contents of folder, once folder shows.
	pickScript = `
const current = document.querySelector('nav[aria-label="Folders"] [aria-current="page"]');
if (current?.textContent !== %s || document.querySelector('[aria-label="Measure progress"]')) return null;
const contents = [...document.querySelectorAll("main section")]
  .find((s) => s.querySelector("h2 span")?.textContent === "Contents");
const box = contents?.querySelector('[role="checkbox"][aria-label=' + JSON.stringify("Pick " + %s) + "]");
if (!box) return null;
if (box.getAttribute("aria-checked") !== "true") box.click();
return true;`
	moveButtonScript = `
const button = [...document.querySelectorAll("footer button")]
  .find((b) => b.textContent.startsWith(%s) && !b.disabled);
if (!button) return null;
button.click();
return true;`
	trashEndScript = `
const result = document.querySelector('[aria-label="Move to Trash result"] [role="status"]');
if (result) return { summary: result.textContent };
const failed = document.querySelector("footer")?.textContent.includes("Move to Trash could not finish");
return failed ? { failed: document.querySelector("footer").textContent } : null;`
)

// trashEnd is how Move to Trash ended: the result line, or the footer after
// a failure.
type trashEnd struct {
	Summary string `json:"summary"`
	Failed  string `json:"failed"`
}

func TestSpaceMovesOnlyThePickedItemsOfAMeasuredFolderToTrash(t *testing.T) {
	requireTestBuild(t)
	manifest := generatedHome(t)
	home := manifest.Home
	writeSpaceFiles(t, home)
	var picked []string
	pickedBytes := map[string]int64{}
	for _, name := range pickedNames {
		path := filepath.Join(home, "Projects", name)
		picked = append(picked, path)
		pickedBytes[path] = treeBytes(t, path)
	}
	before := snapshot(t, home)
	app := startDrivenApp(t, testBuild, home)

	var ok bool
	app.waitFor("the Space tab", loadTimeout, &ok, openTabScript, "Space")
	app.waitFor("the overview's Home", measureTimeout, &ok, clickLabeledScript, "Open Home")
	app.waitFor("Home's Projects", measureTimeout, &ok, clickLabeledScript, "Open Projects")
	for _, name := range pickedNames {
		app.waitFor("the checkbox of "+name, measureTimeout, &ok, pickScript, "Projects", name)
	}
	move := fmt.Sprintf("Move %d items to Trash (", len(pickedNames))
	app.waitFor(fmt.Sprintf("an enabled %q button", move), loadTimeout, &ok, moveButtonScript, move)
	var end trashEnd
	app.waitFor("Move to Trash to end", trashTimeout, &end, trashEndScript)

	if end.Failed != "" {
		t.Fatalf("Move to Trash failed; the footer shows %q", end.Failed)
	}
	if moved := fmt.Sprintf("%d moved", len(pickedNames)); !strings.Contains(end.Summary, moved) || strings.Contains(end.Summary, "skipped") {
		t.Errorf("Move to Trash result = %q, want %s and nothing skipped", end.Summary, moved)
	}
	for _, path := range picked {
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			t.Errorf("picked item %s is still in the fixture (lstat error %v)", path, err)
		}
		trashed := filepath.Join(home, ".Trash", filepath.Base(path))
		if bytes := treeBytes(t, trashed); bytes != pickedBytes[path] {
			t.Errorf("%s holds %d bytes, want picked item %s with %d", trashed, bytes, path, pickedBytes[path])
		}
	}
	assertOnlyRemoved(t, before, picked...)
	for _, item := range manifest.Items {
		if bytes := treeBytes(t, item.Path); bytes != item.Bytes {
			t.Errorf("fixture item %s has %d bytes, want it untouched with %d", item.Path, bytes, item.Bytes)
		}
	}
	for _, file := range spaceFiles {
		path := filepath.Join(home, filepath.FromSlash(file.path))
		if slices.ContainsFunc(picked, func(root string) bool { return within(path, root) }) {
			continue
		}
		if bytes := treeBytes(t, path); bytes != int64(file.bytes) {
			t.Errorf("unpicked %s has %d bytes, want it untouched with %d", path, bytes, file.bytes)
		}
	}
	assertTrashHistory(t, home, picked)
}

// requireTestBuild fails the test unless the binary of testBuild was built
// with the smoke tag: the shipped app would move the fixture into the real
// Trash.
func requireTestBuild(t *testing.T) {
	t.Helper()
	info, err := buildinfo.ReadFile(testBuild.locate(t))
	if err != nil {
		t.Fatalf("reading the build info of %s: %v", testBuild.path, err)
	}
	for _, setting := range info.Settings {
		if setting.Key == "-tags" && slices.Contains(strings.Split(setting.Value, ","), "smoke") {
			return
		}
	}
	t.Fatalf("%s was not built with the smoke tag, run `bun run %s`", testBuild.path, testBuild.buildScript)
}

// writeSpaceFiles adds spaceFiles to home.
func writeSpaceFiles(t *testing.T, home string) {
	t.Helper()
	for _, file := range spaceFiles {
		path := filepath.Join(home, filepath.FromSlash(file.path))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, bytes.Repeat([]byte{1}, file.bytes), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

// assertTrashHistory checks that Space logged one run, which moved exactly
// the picked paths to Trash.
func assertTrashHistory(t *testing.T, home string, picked []string) {
	t.Helper()
	runs := removaltest.History(t, home)
	if len(runs) != 1 {
		t.Fatalf("history has %d runs, want the one Move to Trash: %+v", len(runs), runs)
	}
	var moved []string
	for _, item := range runs[0].Items {
		if item.Method != removal.MoveToTrash || item.Outcome != removal.Removed {
			t.Errorf("history item %+v, want %s and %s", item, removal.MoveToTrash, removal.Removed)
		}
		moved = append(moved, item.Path)
	}
	slices.Sort(moved)
	want := slices.Sorted(slices.Values(picked))
	if !slices.Equal(moved, want) {
		t.Errorf("history moved %q, want %q", moved, want)
	}
}
