package removal

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unicode"
	"unicode/utf8"
)

// protectedPaths are Home-relative folders Burrow never removes, nor anything
// inside or above them. Mole's own critical-deletion roots all lie outside
// Home or are Home itself, which the guard already refuses.
var protectedPaths = []string{
	"Desktop",
	"Documents",
	"Downloads",
	"Movies",
	"Music",
	"Pictures",
	"Public",
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

// Check returns false with the reason when path must be skipped.
func (g *Guard) Check(path string) (SkipReason, bool) {
	if !filepath.IsAbs(path) || hasDotDot(path) || hasControl(path) {
		return Protected, false
	}
	if !g.allows(g.home, path) {
		return Protected, false
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return checkFailure(err), false
	}
	if !g.allows(g.realHome, resolved) {
		return Protected, false
	}
	if _, err := os.Lstat(path); err != nil {
		return checkFailure(err), false
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
	if isProtected(rel) {
		return false
	}
	for _, rule := range g.rules {
		if !rule(rel) {
			return false
		}
	}
	return true
}

// isProtected reports whether rel is a protected path, or lies inside or
// above one. APFS ignores case, so the comparison does too.
func isProtected(rel string) bool {
	rel = strings.ToLower(rel)
	for _, protected := range protectedPaths {
		protected = strings.ToLower(protected)
		if rel == protected || strings.HasPrefix(rel, protected+"/") || strings.HasPrefix(protected, rel+"/") {
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
