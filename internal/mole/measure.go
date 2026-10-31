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
	"time"

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
	Overview   bool           `json:"overview"`
	Path       string         `json:"path"`
	Entries    []analyzeEntry `json:"entries"`
	LargeFiles []analyzeEntry `json:"large_files"`
}

// analyzeEntry is a row of entries or of large_files, which carries the
// first three fields only. Mole sets cleanable on a folder `mo clean` leaves
// alone whose content is regenerable.
type analyzeEntry struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	Size       int64  `json:"size"`
	ScanStatus string `json:"scan_status"`
	IsDir      bool   `json:"is_dir"`
	Insight    bool   `json:"insight"`
	Cleanable  bool   `json:"cleanable"`
}

// readStates translates the scan_status of a row of entries.
var readStates = map[string]space.ReadState{
	"complete":    space.ReadComplete,
	"partial":     space.ReadPartial,
	"unavailable": space.ReadUnavailable,
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
	return m.folder(target.Path, output.Entries, output.LargeFiles), nil
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
			Name:        entry.Name,
			Path:        entry.Path,
			Bytes:       entry.Size,
			IsDir:       entry.IsDir,
			ReadState:   m.readState(entry),
			Insight:     entry.Insight,
			Regenerable: entry.Cleanable,
		})
	}
	return space.Measurement{Items: items}
}

// folder translates the entries directly in folder and the large files
// anywhere below it. Mole marks a symlink only by appending symlinkSuffix
// to its name, and sets is_dir when it points at a folder; Space never
// opens a link, so it becomes a plain item under its own name.
func (m *Measurer) folder(folder string, entries, largeFiles []analyzeEntry) space.Measurement {
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
			Name:        name,
			Path:        entry.Path,
			Bytes:       entry.Size,
			IsDir:       entry.IsDir && !isLink,
			ReadState:   m.readState(entry),
			Regenerable: entry.Cleanable && !isLink,
			ModTime:     m.modTime(entry.Path),
		})
	}
	// Mole may find large files through Spotlight, which is not bound to
	// what it walked.
	files := make([]space.MeasuredItem, 0, len(largeFiles))
	for _, file := range largeFiles {
		if !m.trusted(file) {
			continue
		}
		if !within(folder, file.Path) || file.Path == folder {
			m.logger.Warn("ignoring disk analyzer large file outside the folder", "folder", folder, "path", file.Path)
			continue
		}
		// Mole read a large file to find it, so its size is whole.
		files = append(files, space.MeasuredItem{Name: filepath.Base(file.Path), Path: file.Path, Bytes: file.Size, ReadState: space.ReadComplete})
	}
	return space.Measurement{Items: items, LargestFiles: files}
}

// modTime is when path was last modified, zero with a warning when it cannot
// be read. Mole prints only last_access; lstat keeps a symlink's own time.
func (m *Measurer) modTime(path string) time.Time {
	info, err := os.Lstat(path)
	if err != nil {
		m.logger.Warn("reading when a disk analyzer entry was modified", "path", path, "error", err)
		return time.Time{}
	}
	return info.ModTime()
}

// readState is how much of a row of entries Mole read. A status Burrow does
// not know keeps the row, with a warning, as a partial read: its size may be
// low, and leaving it out would lower the total without a word.
func (m *Measurer) readState(entry analyzeEntry) space.ReadState {
	if state, known := readStates[entry.ScanStatus]; known {
		return state
	}
	m.logger.Warn("disk analyzer entry with an unknown scan status", "path", entry.Path, "scan_status", entry.ScanStatus)
	return space.ReadPartial
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
