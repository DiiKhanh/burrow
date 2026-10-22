// Package service holds the MyGo bound services the frontend calls. They only
// translate between the engine and IPC; `mygo generate` turns them into the
// typed client in src/mygo.ts.
package service

import (
	"log"

	"github.com/DiiKhanh/burrow/internal/engine"
	"github.com/egoist/mygo"
)

// Clean is the bound service behind the Clean tab: Scan and Clean.
type Clean struct{}

// Ping answers the page. MyGo binds only services with a method: remove it
// once Clean has its first real one.
func (*Clean) Ping() {}

// Status is the bound service behind the Status tab: live system health.
type Status struct{}

// StatusSnapshot carries every Status snapshot to the page, once a second
// while the window is shown. Each one holds the sparkline history, so the
// page keeps no state of its own.
var StatusSnapshot = mygo.NewEvent[engine.Snapshot]("status")

// BroadcastStatus sends s to every window.
func BroadcastStatus(s engine.Snapshot) {
	if err := StatusSnapshot.Broadcast(s); err != nil {
		log.Printf("service: sending status: %v", err)
	}
}

// Ping answers the page. MyGo binds only services with a method: remove it
// once Status has its first real one.
func (*Status) Ping() {}
