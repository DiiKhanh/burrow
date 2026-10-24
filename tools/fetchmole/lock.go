package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"regexp"

	"github.com/DiiKhanh/burrow/internal/mole"
)

// Lock pins the Mole release Burrow ships: its tag, and the SHA-256 of
// the files Burrow downloads, as this repository recorded them. Mole's own
// SHA256SUMS is never trusted instead.
type Lock struct {
	Version       string `json:"version"`
	SourceSHA256  string `json:"source_sha256"`
	StatusSHA256  string `json:"status_darwin_arm64_sha256"`
	AnalyzeSHA256 string `json:"analyze_darwin_arm64_sha256"`
}

// releaseBinary is a prebuilt program of a Mole release that Burrow ships
// beside the source: where the release publishes it and where it goes in
// the bundle.
type releaseBinary struct {
	asset  string // e.g. status-darwin-arm64
	path   string // relative to the bundle
	sha256 string
}

// The release assets Burrow ships, as Mole publishes them.
const (
	statusAsset  = "status-darwin-arm64"
	analyzeAsset = "analyze-darwin-arm64"
)

// binaries lists the release binaries the lock pins.
func (l Lock) binaries() []releaseBinary {
	return []releaseBinary{
		{asset: statusAsset, path: mole.StatusPath, sha256: l.StatusSHA256},
		{asset: analyzeAsset, path: mole.AnalyzePath, sha256: l.AnalyzeSHA256},
	}
}

var (
	versionPattern = regexp.MustCompile(`^V[0-9]+\.[0-9]+\.[0-9]+$`)
	sha256Pattern  = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

func validateVersion(version string) error {
	if !versionPattern.MatchString(version) {
		return fmt.Errorf("version %q is not a Mole release tag such as V1.62.0", version)
	}
	return nil
}

func (l Lock) validate() error {
	if err := validateVersion(l.Version); err != nil {
		return err
	}
	for name, sum := range map[string]string{
		"source_sha256":               l.SourceSHA256,
		"status_darwin_arm64_sha256":  l.StatusSHA256,
		"analyze_darwin_arm64_sha256": l.AnalyzeSHA256,
	} {
		if !sha256Pattern.MatchString(sum) {
			return fmt.Errorf("%s %q is not a lowercase hex SHA-256", name, sum)
		}
	}
	return nil
}

func readLock(path string) (Lock, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Lock{}, fmt.Errorf("reading the lock: %w", err)
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var lock Lock
	if err := dec.Decode(&lock); err != nil {
		return Lock{}, fmt.Errorf("parsing %s: %w", path, err)
	}
	if err := lock.validate(); err != nil {
		return Lock{}, fmt.Errorf("%s: %w", path, err)
	}
	return lock, nil
}

func (l Lock) encode() ([]byte, error) {
	data, err := json.MarshalIndent(l, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encoding the lock: %w", err)
	}
	return append(data, '\n'), nil
}

func writeLock(path string, lock Lock) error {
	if err := lock.validate(); err != nil {
		return err
	}
	data, err := lock.encode()
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("writing the lock: %w", err)
	}
	return nil
}
