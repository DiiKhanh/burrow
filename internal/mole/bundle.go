// Package mole is Burrow's adapter to the Mole release that ships inside
// it (ADR 0001). Nothing outside it knows where Mole lives or what it prints.
package mole

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// Layout of the bundle that tools/fetchmole unpacks into
// resources/darwin-arm64/mole and that `mygo build` copies into the app.
const (
	// Dir is the bundle's directory among the app's resources.
	Dir = "mole"
	// MoPath is Mole's entry point, relative to the bundle.
	MoPath = "mo"
	// StatusPath is the status collector, relative to the bundle; Mole's
	// own bin/status.sh runs it from there.
	StatusPath = "bin/status-go"
	// AnalyzePath is the disk analyzer, relative to the bundle; Mole's own
	// bin/analyze.sh runs it from there.
	AnalyzePath = "bin/analyze-go"
)

// Programs are the executables, relative to the bundle, without which it
// is incomplete.
var Programs = []string{MoPath, StatusPath, AnalyzePath}

// Bundle is the Mole release Burrow ships. It never refers to an `mo` the
// user installed.
type Bundle struct {
	dir string
}

// Mo is the path of the bundled `mo`.
func (b Bundle) Mo() string { return filepath.Join(b.dir, MoPath) }

// Status is the path of the bundled status collector.
func (b Bundle) Status() string { return filepath.Join(b.dir, StatusPath) }

// Analyze is the path of the bundled disk analyzer.
func (b Bundle) Analyze() string { return filepath.Join(b.dir, AnalyzePath) }

// ErrNotBundled means the resources hold no complete Mole bundle: run
// `bun run fetch:mole`.
var ErrNotBundled = errors.New("mole: no bundled Mole, run `bun run fetch:mole`")

// Locate finds the bundle among the app's resources, as MyGo's
// App.Path(PathResources) gives them: merged into Contents/Resources in an
// app (`<resources>/mole`), or the project's resources directory as it is
// under `go run` and `go test` (`<resources>/darwin-arm64/mole`).
func Locate(resources string) (Bundle, error) {
	candidates := []string{
		filepath.Join(resources, Dir),
		filepath.Join(resources, runtime.GOOS+"-"+runtime.GOARCH, Dir),
	}
	for _, dir := range candidates {
		if complete(dir) {
			return Bundle{dir: dir}, nil
		}
	}
	return Bundle{}, fmt.Errorf("%w (looked in %s)", ErrNotBundled, resources)
}

func complete(dir string) bool {
	for _, program := range Programs {
		if !isExecutable(filepath.Join(dir, program)) {
			return false
		}
	}
	return true
}

func isExecutable(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0o111 != 0
}
