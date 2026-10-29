package clean

import (
	"fmt"
	"slices"
)

// LockedGroup is a locked junk group: Apps, the apps that own it, are
// running, so nothing in it can be cleaned until they quit.
type LockedGroup struct {
	ID   JunkGroupID `json:"id"`
	Apps []string    `json:"apps"`
}

// ownerApp is an app that locks a junk group while it runs.
type ownerApp struct {
	// name is what the user sees, e.g. "Firefox".
	name string
	// process is the app's executable name, e.g. "firefox".
	process string
}

// groupOwner is a junk group that apps can lock, with those apps in the
// order Review names them.
type groupOwner struct {
	group JunkGroupID
	apps  []ownerApp
}

// groupOwners are the junk groups apps can lock. The browsers are those
// Mole's Browsers section cleans.
var groupOwners = []groupOwner{
	{Browsers, []ownerApp{
		{"Safari", "Safari"},
		{"Google Chrome", "Google Chrome"},
		{"Firefox", "firefox"},
		{"Arc", "Arc"},
		{"Microsoft Edge", "Microsoft Edge"},
		{"Brave Browser", "Brave Browser"},
		{"Chromium", "Chromium"},
		{"Dia", "Dia"},
		{"Opera", "Opera"},
		{"Vivaldi", "Vivaldi"},
		{"Orion", "Orion"},
		{"Zen", "zen"},
		{"Comet", "Comet"},
		{"Helium", "Helium"},
		{"Yandex Browser", "Yandex"},
		{"QQ Browser", "QQBrowser3"},
	}},
}

// Locked lists the junk groups locked right now, in group order.
func (e *Engine) Locked() ([]LockedGroup, error) {
	names, err := e.processes.Names()
	if err != nil {
		return nil, fmt.Errorf("clean: listing running apps: %w", err)
	}
	locked := []LockedGroup{}
	for _, owners := range groupOwners {
		var apps []string
		for _, app := range owners.apps {
			if slices.Contains(names, app.process) {
				apps = append(apps, app.name)
			}
		}
		if len(apps) > 0 {
			locked = append(locked, LockedGroup{ID: owners.group, Apps: apps})
		}
	}
	return locked, nil
}

// isLocked reports whether group is locked right now. When Burrow cannot
// tell which apps run, every group an app can lock counts as locked.
func (e *Engine) isLocked(group JunkGroupID) bool {
	if !slices.ContainsFunc(groupOwners, func(owners groupOwner) bool { return owners.group == group }) {
		return false
	}
	locked, err := e.Locked()
	if err != nil {
		e.logger.Warn("could not tell which apps run", "error", err)
		return true
	}
	return slices.ContainsFunc(locked, func(lock LockedGroup) bool { return lock.ID == group })
}
