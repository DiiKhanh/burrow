package mole

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"maps"
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
	shimDir, err := sudoDenyingDir()
	if err != nil {
		return clean.ScanResult{}, err
	}
	defer func() {
		if err := os.RemoveAll(shimDir); err != nil {
			s.logger.Warn("could not remove sudo shim", "path", shimDir, "error", err)
		}
	}()
	cmd.Env = scanEnvironment(os.Environ(), s.home, shimDir)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return clean.ScanResult{}, fmt.Errorf("reading Mole output: %w", err)
	}
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		return clean.ScanResult{}, fmt.Errorf("starting bundled Mole: %w", err)
	}

	unreadable := make(map[clean.JunkGroupID]bool)
	lines := bufio.NewScanner(stdout)
	for lines.Scan() {
		line := strings.TrimSpace(lines.Text())
		if strings.Contains(line, trashDeniedLine) {
			unreadable[clean.Trash] = true
		}
		if section, ok := outputSection(line); ok {
			rule, mapped := sectionRules[section]
			if !mapped {
				s.logger.Warn("ignoring unknown Mole section", "section", section)
			} else if rule.mode == includeSection {
				if err := sendProgress(onProgress, clean.ScanProgress{GroupID: rule.group}); err != nil {
					stopCommand(cmd)
					return clean.ScanResult{}, err
				}
			}
		}
	}
	if err := lines.Err(); err != nil {
		stopCommand(cmd)
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
	result, err := parseCleanList(s.home, list, s.logger, onProgress, unreadable, pathBytes)
	if err != nil {
		_ = list.Close()
		return clean.ScanResult{}, err
	}
	if err := list.Close(); err != nil {
		return clean.ScanResult{}, fmt.Errorf("closing Mole clean-list: %w", err)
	}
	return result, nil
}

func stopCommand(cmd *exec.Cmd) {
	if cmd.Cancel != nil {
		_ = cmd.Cancel()
	} else if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
	_ = cmd.Wait()
}

// trashDeniedLine is how Mole says it could not list ~/.Trash, which macOS
// refuses without Full Disk Access. Mole prints it in User essentials and
// stays silent about the other paths it cannot read.
const trashDeniedLine = "Trash · skipped, grant Full Disk Access"

// deniedByPrivacy is true for macOS privacy protection's refusal, EPERM
// ("Operation not permitted"). A plain EACCES comes from file modes, which
// Full Disk Access would not change, so it does not make a group unreadable.
// SIP also answers EPERM, but it guards no path inside Home.
func deniedByPrivacy(err error) bool {
	return errors.Is(err, syscall.EPERM)
}

func sendProgress(send func(clean.ScanProgress) error, progress clean.ScanProgress) error {
	if send == nil {
		return nil
	}
	return send(progress)
}

func outputSection(line string) (string, bool) {
	for _, marker := range []string{"➤ ", "=== "} {
		if _, after, found := strings.Cut(line, marker); found {
			section := strings.TrimSpace(after)
			section = strings.TrimSuffix(section, " ===")
			return section, section != ""
		}
	}
	return "", false
}

// sudoShim refuses every call, as `sudo -n` does without cached credentials.
const sudoShim = "#!/bin/sh\nexit 1\n"

// sudoDenyingDir makes a directory whose only entry is a refusing `sudo`.
// Mole previews system paths whenever `sudo -n` succeeds, which passwordless
// sudo always allows; Burrow's Scan stays in the injected Home (ADR 0003).
func sudoDenyingDir() (string, error) {
	dir, err := os.MkdirTemp("", "burrow-nosudo-")
	if err != nil {
		return "", fmt.Errorf("creating sudo shim: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "sudo"), []byte(sudoShim), 0o755); err != nil {
		_ = os.RemoveAll(dir)
		return "", fmt.Errorf("creating sudo shim: %w", err)
	}
	return dir, nil
}

func scanEnvironment(environ []string, home, shimDir string) []string {
	values := map[string]string{
		"HOME":   home,
		"LC_ALL": "C",
		"LANG":   "C",
		"PATH":   shimDir + ":/usr/bin:/bin:/usr/sbin:/sbin",
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
	ignoreSection
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
	"System":                    {mode: ignoreSection},
	"Time Machine":              {mode: ignoreSection},
	"External volume":           {mode: ignoreSection},
	"Large files":               {mode: ignoreSection},
	"Project artifacts":         {mode: ignoreSection},
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
	return parseCleanList(home, input, logger, nil, nil, pathBytes)
}

// parseCleanList reports, in group order, the groups in unreadable and every
// group with an item measure could not read in full for privacy protection.
func parseCleanList(
	home string,
	input io.Reader,
	logger *slog.Logger,
	onProgress func(clean.ScanProgress) error,
	unreadable map[clean.JunkGroupID]bool,
	measure func(string) (int64, error),
) (clean.ScanResult, error) {
	unreadable = maps.Clone(unreadable)
	if unreadable == nil {
		unreadable = make(map[clean.JunkGroupID]bool)
	}
	if logger == nil {
		logger = slog.Default()
	}
	home = filepath.Clean(home)
	grouped := make(map[clean.JunkGroupID][]string)
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
		grouped[groupID] = append(grouped[groupID], path)
	}
	if err := scanner.Err(); err != nil {
		return clean.ScanResult{}, fmt.Errorf("reading Mole clean-list: %w", err)
	}

	result := clean.ScanResult{Groups: make([]clean.JunkGroup, 0, len(grouped))}
	var foundBytes int64
	complete := 1.0
	for _, groupID := range groupOrder {
		paths := grouped[groupID]
		if len(paths) == 0 {
			continue
		}
		items := make([]clean.JunkItem, 0, len(paths))
		var groupBytes int64
		for _, path := range paths {
			if err := sendProgress(onProgress, clean.ScanProgress{
				GroupID:     groupID,
				GroupBytes:  groupBytes,
				FoundBytes:  foundBytes,
				CurrentPath: path,
			}); err != nil {
				return clean.ScanResult{}, err
			}
			bytes, err := measure(path)
			switch {
			case deniedByPrivacy(err):
				// bytes still counts the part privacy protection left readable.
				logger.Warn("could not read all of junk item", "path", path, "error", err)
				unreadable[groupID] = true
			case err != nil:
				logger.Warn("could not measure junk item", "path", path, "error", err)
				bytes = 0
			}
			groupBytes += bytes
			foundBytes += bytes
			items = append(items, clean.JunkItem{
				ID:    stableItemID(groupID, path),
				Path:  path,
				Bytes: bytes,
			})
			if err := sendProgress(onProgress, clean.ScanProgress{
				GroupID:     groupID,
				GroupBytes:  groupBytes,
				FoundBytes:  foundBytes,
				CurrentPath: path,
			}); err != nil {
				return clean.ScanResult{}, err
			}
		}
		policy := groupPolicy[groupID]
		result.Groups = append(result.Groups, clean.JunkGroup{
			ID:              groupID,
			RemovalMethod:   policy.method,
			DefaultSelected: policy.selected,
			Items:           items,
		})
		if err := sendProgress(onProgress, clean.ScanProgress{
			GroupID:    groupID,
			GroupBytes: groupBytes,
			FoundBytes: foundBytes,
			Fraction:   &complete,
		}); err != nil {
			return clean.ScanResult{}, err
		}
	}
	result.Unreadable = make([]clean.JunkGroupID, 0, len(unreadable))
	for _, groupID := range groupOrder {
		if unreadable[groupID] {
			result.Unreadable = append(result.Unreadable, groupID)
		}
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

// pathBytes sizes path. It walks past folders privacy protection refuses,
// returning the readable total with the first such refusal.
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
	var refused error
	err = filepath.WalkDir(path, func(current string, entry os.DirEntry, walkErr error) error {
		if deniedByPrivacy(walkErr) {
			if refused == nil {
				refused = walkErr
			}
			return nil
		}
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
	if err != nil {
		return total, err
	}
	return total, refused
}
