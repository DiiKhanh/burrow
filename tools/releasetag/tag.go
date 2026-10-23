package main

import (
	"fmt"
	"regexp"
)

// release is what a tag publishes.
type release struct {
	// Version is the tag without its "v", e.g. 0.1.0 or 0.1.0-rc.1.
	Version string
	// Prerelease is set for a tag with a pre-release suffix.
	Prerelease bool
}

var (
	// versionPattern is the app's version, X.Y.Z, as macOS wants it in the
	// bundle.
	versionPattern = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)
	// tagPattern is v and an X.Y.Z version, optionally followed by a semver
	// pre-release suffix of dot-separated identifiers, such as -rc.1.
	tagPattern = regexp.MustCompile(`^v([0-9]+\.[0-9]+\.[0-9]+)(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`)
)

// parseTag returns what tag releases of the app at appVersion: tag vX.Y.Z
// releases X.Y.Z, and vX.Y.Z-rc.1 makes a pre-release of it.
func parseTag(tag, appVersion string) (release, error) {
	if !versionPattern.MatchString(appVersion) {
		return release{}, fmt.Errorf("version %s in mygo.config.ts is not X.Y.Z", appVersion)
	}
	m := tagPattern.FindStringSubmatch(tag)
	if m == nil || m[1] != appVersion {
		return release{}, fmt.Errorf("tag %s does not match version %s in mygo.config.ts: tag v%[2]s, or v%[2]s-rc.1 for a pre-release, or bump the version first", tag, appVersion)
	}
	return release{Version: tag[1:], Prerelease: m[2] != ""}, nil
}
