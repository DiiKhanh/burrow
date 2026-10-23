package clean

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unicode"
	"unicode/utf8"
)

// protectedPaths are Home-relative folders Clean never removes, nor anything
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

// guard re-checks a junk item right before removal. It returns false with the
// reason when the item must be skipped. realHome is Home with every symlink
// resolved.
func (e *Engine) guard(realHome, path string) (SkipReason, bool) {
	if !filepath.IsAbs(path) || hasDotDot(path) || hasControl(path) {
		return Protected, false
	}
	if !safeUnder(e.home, path) {
		return Protected, false
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return checkFailure(err), false
	}
	if !safeUnder(realHome, resolved) {
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

// safeUnder reports whether path lies strictly below home and clear of every
// protected path. APFS ignores case, so the comparison does too.
func safeUnder(home, path string) bool {
	rel, err := filepath.Rel(home, path)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, "../") {
		return false
	}
	rel = strings.ToLower(filepath.ToSlash(rel))
	for _, protected := range protectedPaths {
		protected = strings.ToLower(protected)
		if rel == protected || strings.HasPrefix(rel, protected+"/") || strings.HasPrefix(protected, rel+"/") {
			return false
		}
	}
	return true
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

// removalFailure maps an error from the Remover. Whatever else stops a
// removal, the system refused it, so it reads as permission denied.
func removalFailure(err error) SkipReason {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return AlreadyGone
	case errors.Is(err, syscall.EBUSY), errors.Is(err, syscall.ETXTBSY):
		return InUse
	default:
		return PermissionDenied
	}
}
