package mole

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/DiiKhanh/burrow/internal/clean"
)

// Scanner runs the bundled Mole against one injected Home.
type Scanner struct {
	bundle Bundle
	home   string
	logger *slog.Logger
}

// NewScanner constructs the Mole adapter. It never discovers HOME or an `mo`
// executable from the ambient machine.
func NewScanner(bundle Bundle, home string, logger *slog.Logger) *Scanner {
	if logger == nil {
		logger = slog.Default()
	}
	return &Scanner{bundle: bundle, home: filepath.Clean(home), logger: logger}
}

// Scan runs `mo clean --dry-run`, streams mapped progress, then parses the
// clean-list written beneath the injected Home.
func (s *Scanner) Scan(ctx context.Context, onProgress func(clean.ScanProgress) error) (clean.ScanResult, error) {
	cmd := exec.CommandContext(ctx, s.bundle.Mo(), "clean", "--dry-run")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return os.ErrProcessDone
		}
		err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		if err == syscall.ESRCH {
			return os.ErrProcessDone
		}
		return err
	}
	cmd.WaitDelay = 2 * time.Second
	cmd.Env = scanEnvironment(os.Environ(), s.home)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return clean.ScanResult{}, fmt.Errorf("reading Mole output: %w", err)
	}
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		return clean.ScanResult{}, fmt.Errorf("starting bundled Mole: %w", err)
	}

	var active clean.JunkGroupID
	lines := bufio.NewScanner(stdout)
	for lines.Scan() {
		line := strings.TrimSpace(lines.Text())
		if section, ok := outputSection(line); ok {
			rule, mapped := sectionRules[section]
			if !mapped {
				s.logger.Warn("ignoring unknown Mole section", "section", section)
				active = ""
			} else if rule.mode == includeSection {
				active = rule.group
				if err := sendProgress(onProgress, clean.ScanProgress{GroupID: active}); err != nil {
					_ = cmd.Process.Kill()
					_ = cmd.Wait()
					return clean.ScanResult{}, err
				}
			} else {
				active = ""
			}
			continue
		}
		if active != "" {
			if start := strings.Index(line, s.home); start >= 0 {
				path := strings.TrimSpace(line[start:])
				if err := sendProgress(onProgress, clean.ScanProgress{GroupID: active, CurrentPath: path}); err != nil {
					_ = cmd.Process.Kill()
					_ = cmd.Wait()
					return clean.ScanResult{}, err
				}
			}
		}
	}
	if err := lines.Err(); err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return clean.ScanResult{}, fmt.Errorf("reading Mole output: %w", err)
	}
	if err := cmd.Wait(); err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return clean.ScanResult{}, ctxErr
		}
		return clean.ScanResult{}, fmt.Errorf("running bundled Mole: %w", err)
	}

	listPath := filepath.Join(s.home, ".config", "mole", "clean-list.txt")
	list, err := os.Open(listPath)
	if err != nil {
		return clean.ScanResult{}, fmt.Errorf("opening Mole clean-list: %w", err)
	}
	defer list.Close()
	result, err := ParseCleanList(s.home, list, s.logger)
	if err != nil {
		return clean.ScanResult{}, err
	}
	var found int64
	complete := 1.0
	for _, group := range result.Groups {
		var groupBytes int64
		for _, item := range group.Items {
			groupBytes += item.Bytes
		}
		found += groupBytes
		if err := sendProgress(onProgress, clean.ScanProgress{
			GroupID:    group.ID,
			GroupBytes: groupBytes,
			FoundBytes: found,
			Fraction:   &complete,
		}); err != nil {
			return clean.ScanResult{}, err
		}
	}
	return result, nil
}

func sendProgress(send func(clean.ScanProgress) error, progress clean.ScanProgress) error {
	if send == nil {
		return nil
	}
	return send(progress)
}

func outputSection(line string) (string, bool) {
	for _, marker := range []string{"➤ ", "=== "} {
		if index := strings.Index(line, marker); index >= 0 {
			section := strings.TrimSpace(line[index+len(marker):])
			section = strings.TrimSuffix(section, " ===")
			return section, section != ""
		}
	}
	return "", false
}

func scanEnvironment(environ []string, home string) []string {
	values := map[string]string{
		"HOME":   home,
		"LC_ALL": "C",
		"LANG":   "C",
		"PATH":   "/usr/bin:/bin:/usr/sbin:/sbin",
		"TERM":   "dumb",
	}
	for _, entry := range environ {
		name, value, found := strings.Cut(entry, "=")
		if found && name == "TMPDIR" {
			values[name] = value
		}
	}
	result := make([]string, 0, len(values))
	for name, value := range values {
		result = append(result, name+"="+value)
	}
	return result
}

type sectionMode uint8

const (
	includeSection sectionMode = iota
	excludeSection
	hideSection
)

type sectionRule struct {
	group clean.JunkGroupID
	mode  sectionMode
}

var sectionRules = map[string]sectionRule{
	"App caches":                {group: clean.AppCaches},
	"Cloud & Office":            {group: clean.AppCaches},
	"Apps & utilities":          {group: clean.AppCaches},
	"Apple Silicon updates":     {group: clean.AppCaches},
	"Browsers":                  {group: clean.Browsers},
	"User essentials":           {group: clean.LogsSavedState},
	"Application Support":       {group: clean.LogsSavedState},
	"User Trash":                {group: clean.Trash},
	"Developer tools":           {group: clean.DeveloperTools},
	"Virtualization":            {group: clean.Virtualization},
	"App leftovers":             {group: clean.AppLeftovers},
	"Device backups & firmware": {group: clean.DeviceFirmware},
	"System":                    {mode: excludeSection},
	"Time Machine":              {mode: excludeSection},
	"External volume":           {mode: excludeSection},
	"Large files":               {mode: hideSection},
	"Project artifacts":         {mode: hideSection},
}

var (
	sectionLine = regexp.MustCompile(`^=== (.+) ===$`)
	itemLine    = regexp.MustCompile(`^(.*)  # (?:size unknown|[0-9]+(?:\.[0-9]+)?[KMGTPE]?B)(?:,.*)?$`)
)

var groupOrder = []clean.JunkGroupID{
	clean.AppCaches,
	clean.Browsers,
	clean.LogsSavedState,
	clean.Trash,
	clean.DeveloperTools,
	clean.Virtualization,
	clean.AppLeftovers,
	clean.DeviceFirmware,
}

var groupPolicy = map[clean.JunkGroupID]struct {
	method   clean.RemovalMethod
	selected bool
}{
	clean.AppCaches:      {method: clean.Delete, selected: true},
	clean.Browsers:       {method: clean.Delete, selected: true},
	clean.LogsSavedState: {method: clean.Delete, selected: true},
	clean.Trash:          {method: clean.Delete, selected: true},
	clean.DeveloperTools: {method: clean.Delete},
	clean.Virtualization: {method: clean.MoveToTrash},
	clean.AppLeftovers:   {method: clean.MoveToTrash, selected: true},
	clean.DeviceFirmware: {method: clean.MoveToTrash},
}

// ParseCleanList translates Mole's clean-list into Burrow's stable Scan
// contract. Human-readable Mole sizes are deliberately ignored.
func ParseCleanList(home string, input io.Reader, logger *slog.Logger) (clean.ScanResult, error) {
	if logger == nil {
		logger = slog.Default()
	}
	home = filepath.Clean(home)
	grouped := make(map[clean.JunkGroupID][]clean.JunkItem)
	var current sectionRule
	knownSection := false

	scanner := bufio.NewScanner(input)
	for scanner.Scan() {
		line := scanner.Text()
		if match := sectionLine.FindStringSubmatch(line); match != nil {
			var ok bool
			current, ok = sectionRules[match[1]]
			knownSection = ok
			if !ok {
				logger.Warn("ignoring unknown Mole section", "section", match[1])
			}
			continue
		}
		if !knownSection || current.mode != includeSection || strings.Contains(line, ", counted under ") {
			continue
		}
		match := itemLine.FindStringSubmatch(line)
		if match == nil {
			continue
		}
		path := filepath.Clean(match[1])
		if !within(home, path) {
			logger.Warn("ignoring Mole path outside Home", "path", path)
			continue
		}
		groupID := current.group
		if groupID == clean.LogsSavedState && within(filepath.Join(home, ".Trash"), path) {
			groupID = clean.Trash
		}
		if groupID == clean.DeviceFirmware && !strings.EqualFold(filepath.Ext(path), ".ipsw") {
			continue
		}
		bytes, err := pathBytes(path)
		if err != nil {
			logger.Warn("could not measure junk item", "path", path, "error", err)
			bytes = 0
		}
		grouped[groupID] = append(grouped[groupID], clean.JunkItem{
			ID:    stableItemID(groupID, path),
			Path:  path,
			Bytes: bytes,
		})
	}
	if err := scanner.Err(); err != nil {
		return clean.ScanResult{}, fmt.Errorf("reading Mole clean-list: %w", err)
	}

	result := clean.ScanResult{Groups: make([]clean.JunkGroup, 0, len(grouped))}
	for _, groupID := range groupOrder {
		items := grouped[groupID]
		if len(items) == 0 {
			continue
		}
		policy := groupPolicy[groupID]
		result.Groups = append(result.Groups, clean.JunkGroup{
			ID:              groupID,
			RemovalMethod:   policy.method,
			DefaultSelected: policy.selected,
			Items:           items,
		})
	}
	return result, nil
}

func within(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func stableItemID(groupID clean.JunkGroupID, path string) string {
	sum := sha256.Sum256([]byte(string(groupID) + "\x00" + path))
	return hex.EncodeToString(sum[:])
}

func pathBytes(path string) (int64, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return 0, err
	}
	if !info.IsDir() {
		if info.Mode().IsRegular() {
			return info.Size(), nil
		}
		return 0, nil
	}
	var total int64
	err = filepath.WalkDir(path, func(current string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type().IsRegular() {
			entryInfo, infoErr := entry.Info()
			if infoErr != nil {
				return infoErr
			}
			total += entryInfo.Size()
		}
		return nil
	})
	return total, err
}
