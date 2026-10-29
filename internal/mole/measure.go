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
	"unicode"

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
	Entries  []analyzeEntry `json:"entries"`
}

type analyzeEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"is_dir"`
	Insight bool   `json:"insight"`
}

// Measure runs the analyzer for target and translates what it prints. The
// analyzer prints nothing until it is done, so there is no progress.
// Ending ctx kills it with the children it started.
func (m *Measurer) Measure(ctx context.Context, target space.MeasureTarget) (space.Measurement, error) {
	if target.Kind != space.Overview {
		return space.Measurement{}, fmt.Errorf("mole: measuring %q: %w", target.Kind, space.ErrInvalidTarget)
	}
	// Without a path the analyzer measures the overview, finding Home's
	// rows through HOME.
	cmd := groupCommand(ctx, m.bundle.Analyze(), "--json")
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
	if !output.Overview {
		return space.Measurement{}, errors.New("mole: the disk analyzer measured a folder, not the overview")
	}
	return m.measurement(output.Entries), nil
}

// measurement translates entries, leaving out with a warning any whose path
// or size cannot be trusted.
func (m *Measurer) measurement(entries []analyzeEntry) space.Measurement {
	items := make([]space.MeasuredItem, 0, len(entries))
	for _, entry := range entries {
		if !trustedPath(entry.Path) || entry.Name == "" || entry.Size < 0 {
			m.logger.Warn("ignoring disk analyzer entry", "name", entry.Name, "path", entry.Path, "size", entry.Size)
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

// trustedPath is true for an absolute path already in its clean form, with
// no `..` and no control characters.
func trustedPath(path string) bool {
	return filepath.IsAbs(path) && filepath.Clean(path) == path && !strings.ContainsFunc(path, unicode.IsControl)
}
