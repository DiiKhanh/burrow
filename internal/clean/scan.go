// Package clean owns Burrow's Scan contract. Adapters translate their own
// formats into these codes so callers never need to know about Mole sections.
package clean

import "context"

// JunkGroupID is a stable, untranslated junk-group code.
type JunkGroupID string

const (
	AppCaches      JunkGroupID = "app-caches"
	Browsers       JunkGroupID = "browsers"
	LogsSavedState JunkGroupID = "logs-saved-state"
	Trash          JunkGroupID = "trash"
	DeveloperTools JunkGroupID = "developer-tools"
	Virtualization JunkGroupID = "virtualization"
	AppLeftovers   JunkGroupID = "app-leftovers"
	DeviceFirmware JunkGroupID = "device-firmware"
)

// RemovalMethod says how a later Clean removes a group.
type RemovalMethod string

const (
	Delete      RemovalMethod = "delete"
	MoveToTrash RemovalMethod = "move-to-trash"
)

// JunkItem is one path proposed by a Scan.
type JunkItem struct {
	ID    string `json:"id"`
	Path  string `json:"path"`
	Bytes int64  `json:"bytes"`
}

// JunkGroup collects items with one removal policy and selection default.
type JunkGroup struct {
	ID              JunkGroupID   `json:"id"`
	RemovalMethod   RemovalMethod `json:"removalMethod"`
	DefaultSelected bool          `json:"defaultSelected"`
	Items           []JunkItem    `json:"items"`
}

// ScanResult is the complete preview returned by Scan.
type ScanResult struct {
	Groups []JunkGroup `json:"groups"`
}

// ScanProgress is an observable point in a running Scan. Fraction is nil
// when Mole exposes no reliable percentage for the active group.
type ScanProgress struct {
	GroupID     JunkGroupID `json:"groupId"`
	GroupBytes  int64       `json:"groupBytes"`
	FoundBytes  int64       `json:"foundBytes"`
	CurrentPath string      `json:"currentPath"`
	Fraction    *float64    `json:"fraction"`
}

// Scanner is the seam filled by the Mole adapter.
type Scanner interface {
	Scan(context.Context, func(ScanProgress) error) (ScanResult, error)
}
