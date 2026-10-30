package clean

import "strings"

// ground is Clean's ground: the Home-relative folders whose content Clean
// removes as junk. Mole decides what Clean finds in them, by its clean-list
// sections, so this list is kept by hand; it lives here so that Space, which
// leaves what lies in them to Clean, never keeps a copy.
var ground = []string{
	"Library/Caches",
	"Library/Logs",
	"Library/Saved Application State",
	".Trash",
}

// InGround reports whether rel, slash-separated and relative to Home, is
// one of the folders Clean empties or lies inside one. APFS ignores case,
// so the comparison does too.
func InGround(rel string) bool {
	rel = strings.ToLower(rel)
	for _, folder := range ground {
		folder = strings.ToLower(folder)
		if rel == folder || strings.HasPrefix(rel, folder+"/") {
			return true
		}
	}
	return false
}
