package space

import (
	"path/filepath"
	"slices"
)

// LockedItem is a locked Space item: App is running and holds live data at
// Path, so neither Path, what lies in it, nor a folder that holds it can move
// until App quits.
type LockedItem struct {
	Path string `json:"path"`
	App  string `json:"app"`
}

// liveDataOwner is an app that holds live data at a Home-relative path while
// it runs. Any one of processes running counts: an app's window can close
// while what uses the data goes on, so the owner's helpers count too. Each
// process is named as removal.Processes lists it, cut to 16 bytes. None is a
// helper that outlives the app, or the path would never unlock.
type liveDataOwner struct {
	rel       string
	app       string
	processes []string
}

// liveDataOwners are the owners Burrow knows, one per Insight of Mole's that
// is the live data of an app. The OrbStack path holds OrbStack's Apple team
// id, which Mole's Insight matches with a glob.
var liveDataOwners = []liveDataOwner{
	{
		rel:       "Library/Containers/com.docker.docker/Data",
		app:       "Docker",
		processes: []string{"Docker Desktop", "com.docker.backe", "com.docker.virtu", "com.docker.krun"},
	},
	{
		rel:       "Library/Group Containers/HUAQ24HBR6.dev.orbstack/data",
		app:       "OrbStack",
		processes: []string{"OrbStack", "OrbStack Helper"},
	},
	{
		rel:       "Library/Developer/CoreSimulator/Devices",
		app:       "Simulator",
		processes: []string{"Simulator", "launchd_sim"},
	},
}

// Locked lists the locked Space items right now, in owner order. When Burrow
// cannot tell which apps run, every owner counts as running.
func (e *Engine) Locked() []LockedItem {
	running := e.runningOwners()
	locked := make([]LockedItem, 0, len(running))
	for _, owner := range running {
		locked = append(locked, LockedItem{Path: filepath.Join(e.home, owner.rel), App: owner.app})
	}
	return locked
}

// liveData is what the running apps hold right now, relative to Home. The UI
// hides what it knows is locked; the engine's check on this holds when the UI
// is wrong or stale, or a symlink fools it.
func (e *Engine) liveData() []string {
	running := e.runningOwners()
	rels := make([]string, 0, len(running))
	for _, owner := range running {
		rels = append(rels, owner.rel)
	}
	return rels
}

func (e *Engine) runningOwners() []liveDataOwner {
	names, err := e.processes.Names()
	if err != nil {
		e.logger.Warn("could not tell which apps run", "error", err)
		return liveDataOwners
	}
	return slices.DeleteFunc(slices.Clone(liveDataOwners), func(owner liveDataOwner) bool {
		return !slices.ContainsFunc(owner.processes, func(process string) bool { return slices.Contains(names, process) })
	})
}
