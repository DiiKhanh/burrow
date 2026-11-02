package removal

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"unicode"
	"unicode/utf8"
)

// personalFolders are the first-level folders that hold what the user keeps
// by hand. Burrow never removes one, nor, unless the user picked it, anything
// inside (ADR 0004).
var personalFolders = []string{
	"Desktop",
	"Documents",
	"Downloads",
	"Movies",
	"Music",
	"Pictures",
	"Public",
}

// protectedPaths are Home-relative folders Burrow never removes, nor anything
// inside or above them. Mole's own critical-deletion roots all lie outside
// Home or are Home itself, which the guard already refuses.
var protectedPaths = []string{
	"Library/Mobile Documents",
	"Library/CloudStorage",
	"Library/Keychains",
	"Library/Mail",
	"Library/Messages",
	"Library/Application Support/Burrow",
	".config/mole",
	".ssh",
	".gnupg",
}

// Guard re-checks an item right before removal: the path must be absolute,
// free of `..` and control characters, strictly below Home both as given and
// with every symlink resolved, clear of the protected paths, and still there.
type Guard struct {
	home string
	// realHome is home with every symlink resolved.
	realHome string
	rules    []Rule
	// insidePersonal lets through what lies inside a personal folder.
	insidePersonal bool
}

// Rule is a check a caller adds to its Guard on top of the shared ones. It
// reports whether rel may be removed. rel is the path relative to Home,
// slash-separated, and never "." or above Home; the Guard asks once for the
// path as given and once with every symlink resolved. APFS ignores case, so
// a rule that compares names should too.
type Rule func(rel string) bool

// NewGuard returns a Guard for home that also applies rules. It resolves
// Home's symlinks now, so build one per run.
func NewGuard(home string, rules ...Rule) (*Guard, error) {
	home = filepath.Clean(home)
	realHome, err := filepath.EvalSymlinks(home)
	if err != nil {
		return nil, fmt.Errorf("removal: resolving Home: %w", err)
	}
	return &Guard{home: home, realHome: realHome, rules: rules}, nil
}

// NewPickedGuard is NewGuard for items the user picked by hand and that go to
// the Trash, where they can be put back: what lies inside a personal folder
// passes. The folder itself and every other protected path still do not.
func NewPickedGuard(home string, rules ...Rule) (*Guard, error) {
	guard, err := NewGuard(home, rules...)
	if err != nil {
		return nil, err
	}
	guard.insidePersonal = true
	return guard, nil
}

// Check returns false with the reason when path must be skipped.
func (g *Guard) Check(path string) (SkipReason, bool) {
	if !filepath.IsAbs(path) || hasDotDot(path) || hasControl(path) {
		return Protected, false
	}
	if !g.allows(g.home, path) {
		return Protected, false
	}
	if _, err := os.Lstat(path); err != nil {
		return checkFailure(err), false
	}
	resolved, err := filepath.EvalSymlinks(path)
	if errors.Is(err, fs.ErrNotExist) {
		// Lstat found path, so it is a dangling symlink, not gone: where it
		// points cannot be checked.
		return Protected, false
	}
	if err != nil {
		return checkFailure(err), false
	}
	if !g.allows(g.realHome, resolved) {
		return Protected, false
	}
	return "", true
}

func hasDotDot(path string) bool {
	for segment := range strings.SplitSeq(path, "/") {
		if segment == ".." {
			return true
		}
	}
	return false
}

func hasControl(path string) bool {
	if !utf8.ValidString(path) {
		return true
	}
	return strings.ContainsFunc(path, unicode.IsControl)
}

// allows reports whether path lies strictly below home, clear of every
// protected path, and passes every rule.
func (g *Guard) allows(home, path string) bool {
	rel, err := filepath.Rel(home, path)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, "../") {
		return false
	}
	rel = filepath.ToSlash(rel)
	if g.isProtected(rel) {
		return false
	}
	for _, rule := range g.rules {
		if !rule(rel) {
			return false
		}
	}
	return true
}

// isProtected reports whether rel may never be removed. APFS ignores case,
// so the comparison does too.
func (g *Guard) isProtected(rel string) bool {
	rel = strings.ToLower(rel)
	if g.insidePersonal {
		return covers(protectedPaths, rel) || slices.ContainsFunc(personalFolders, func(folder string) bool {
			return strings.ToLower(folder) == rel
		})
	}
	return covers(protectedPaths, rel) || covers(personalFolders, rel)
}

// covers reports whether rel, in lower case, is one of paths, or lies inside
// or above one.
func covers(paths []string, rel string) bool {
	for _, path := range paths {
		path = strings.ToLower(path)
		if rel == path || strings.HasPrefix(rel, path+"/") || strings.HasPrefix(path, rel+"/") {
			return true
		}
	}
	return false
}

// checkFailure maps an error met while checking a path. A path Burrow cannot
// make sense of, such as a symlink loop, is treated as protected.
func checkFailure(err error) SkipReason {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return AlreadyGone
	case errors.Is(err, fs.ErrPermission):
		return PermissionDenied
	default:
		return Protected
	}
}

// FailureReason maps an error from a Remover. Whatever else stops a
// removal, the system refused it, so it reads as permission denied.
func FailureReason(err error) SkipReason {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return AlreadyGone
	case errors.Is(err, syscall.EBUSY), errors.Is(err, syscall.ETXTBSY):
		return InUse
	default:
		return PermissionDenied
	}
}
