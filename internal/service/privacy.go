package service

import (
	"errors"
	"fmt"
)

// SettingsPane is the System Settings pane Burrow managed to open.
type SettingsPane string

const (
	// FullDiskAccessPane is Privacy & Security › Full Disk Access itself.
	FullDiskAccessPane SettingsPane = "full-disk-access"
	// PrivacySecurityPane is Privacy & Security, where the user still has to
	// find Full Disk Access.
	PrivacySecurityPane SettingsPane = "privacy-security"
)

// System Settings URLs. macOS offers no API to read or grant Full Disk
// Access, so Burrow only opens the pane where the user grants it.
const (
	fullDiskAccessURL  = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
	privacySecurityURL = "x-apple.systempreferences:com.apple.preference.security"
)

// Privacy is the bound service that sends the user to grant Full Disk Access.
type Privacy struct {
	open func(url string) error
}

// NewPrivacy returns the bound service; open opens a URL, as
// mygo.Shell.OpenExternal does.
func NewPrivacy(open func(url string) error) *Privacy {
	return &Privacy{open: open}
}

// OpenFullDiskAccess opens Full Disk Access in System Settings, or Privacy &
// Security when the direct link does not open, and says which one opened.
func (p *Privacy) OpenFullDiskAccess() (SettingsPane, error) {
	direct := p.open(fullDiskAccessURL)
	if direct == nil {
		return FullDiskAccessPane, nil
	}
	if err := p.open(privacySecurityURL); err != nil {
		return "", fmt.Errorf("opening System Settings: %w", errors.Join(direct, err))
	}
	return PrivacySecurityPane, nil
}
