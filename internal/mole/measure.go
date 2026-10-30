package mole

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/DiiKhanh/burrow/internal/space"
)

// Measurer runs the bundled disk analyzer against one injected Home.
type Measurer struct {
	bundle Bundle
	home   string
	logger *slog.Logger
}

// NewMeasurer constructs the Mole adapter for Space. It never discovers
// HOME from the ambient machine.
func NewMeasurer(bundle Bundle, home string, logger *slog.Logger) *Measurer {
	if logger == nil {
		logger = slog.Default()
	}
	return &Measurer{bundle: bundle, home: filepath.Clean(home), logger: logger}
}

// analyzeOutput is what `analyze-go --json` prints. Its total_size is left
// out on purpose: it adds the insights to the locations they lie in.
type analyzeOutput struct {
	Overview bool           `json:"overview"`
	Path     string         `json:"path"`
	Entries  []analyzeEntry `json:"entries"`
}

type analyzeEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"is_dir"`
	Insight bool   `json:"insight"`
}

// symlinkSuffix is what Mole appends to a symlink's name in a folder.
const symlinkSuffix = " →"

// Measure runs the analyzer for target and translates what it prints. The
// analyzer prints nothing until it is done, so there is no progress.
// Ending ctx kills it with the children it started.
func (m *Measurer) Measure(ctx context.Context, target space.MeasureTarget) (space.Measurement, error) {
	var args []string
	switch target.Kind {
	case space.Overview:
		// Without a path the analyzer measures the overview, finding
		// Home's rows through HOME.
		args = []string{"--json"}
	case space.Folder:
		if !space.CleanAbsolute(target.Path) {
			return space.Measurement{}, fmt.Errorf("mole: measuring %q: %w", target.Path, space.ErrInvalidTarget)
		}
		args = []string{"--json", target.Path}
	default:
		return space.Measurement{}, fmt.Errorf("mole: measuring %q: %w", target.Kind, space.ErrInvalidTarget)
	}
	cmd := groupCommand(ctx, m.bundle.Analyze(), args...)
	cmd.Env = moleEnvironment(os.Environ(), m.home, systemPath)
	out, err := cmd.Output()
	if ctxErr := ctx.Err(); ctxErr != nil {
		return space.Measurement{}, fmt.Errorf("mole: running the disk analyzer: %w", ctxErr)
	}
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return space.Measurement{}, fmt.Errorf("mole: running the disk analyzer: %w: %s", err, strings.TrimSpace(string(exitErr.Stderr)))
		}
		return space.Measurement{}, fmt.Errorf("mole: running the disk analyzer: %w", err)
	}
	var output analyzeOutput
	if err := json.Unmarshal(out, &output); err != nil {
		return space.Measurement{}, fmt.Errorf("mole: reading the disk analyzer's output: %w", err)
	}
	if target.Kind == space.Overview {
		if !output.Overview {
			return space.Measurement{}, errors.New("mole: the disk analyzer measured a folder, not the overview")
		}
		return m.overview(output.Entries), nil
	}
	if output.Overview || output.Path != target.Path {
		return space.Measurement{}, fmt.Errorf("mole: the disk analyzer measured %q, not %q", output.Path, target.Path)
	}
	return m.folder(target.Path, output.Entries), nil
}

// overview translates the overview's entries, which carry Mole's labels
// ("User Library") for names.
func (m *Measurer) overview(entries []analyzeEntry) space.Measurement {
	items := make([]space.MeasuredItem, 0, len(entries))
	for _, entry := range entries {
		if !m.trusted(entry) {
			continue
		}
		items = append(items, space.MeasuredItem{
			Name:    entry.Name,
			Path:    entry.Path,
			Bytes:   entry.Size,
			IsDir:   entry.IsDir,
			Insight: entry.Insight,
		})
	}
	return space.Measurement{Items: items}
}

// folder translates the entries directly in folder. Mole marks a symlink
// only by appending symlinkSuffix to its name, and sets is_dir when it
// points at a folder; Space never opens a link, so it becomes a plain item
// under its own name.
func (m *Measurer) folder(folder string, entries []analyzeEntry) space.Measurement {
	items := make([]space.MeasuredItem, 0, len(entries))
	for _, entry := range entries {
		if !m.trusted(entry) {
			continue
		}
		if filepath.Dir(entry.Path) != folder || entry.Path == folder {
			m.logger.Warn("ignoring disk analyzer entry outside the folder", "folder", folder, "path", entry.Path)
			continue
		}
		name := filepath.Base(entry.Path)
		isLink := entry.Name == name+symlinkSuffix
		items = append(items, space.MeasuredItem{
			Name:  name,
			Path:  entry.Path,
			Bytes: entry.Size,
			IsDir: entry.IsDir && !isLink,
		})
	}
	return space.Measurement{Items: items}
}

// trusted is false, with a warning, for an entry whose path or size cannot
// be trusted.
func (m *Measurer) trusted(entry analyzeEntry) bool {
	if space.CleanAbsolute(entry.Path) && entry.Name != "" && entry.Size >= 0 {
		return true
	}
	m.logger.Warn("ignoring disk analyzer entry", "name", entry.Name, "path", entry.Path, "size", entry.Size)
	return false
}
