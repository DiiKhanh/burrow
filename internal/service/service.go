// Package service holds the MyGo bound services the frontend calls. They only
// translate between the engine and IPC; `mygo generate` turns them into the
// typed client in src/mygo.ts.
package service

// Clean is the bound service behind the Clean tab: Scan and Clean.
type Clean struct{}

// Ping answers the page. MyGo binds only services with a method: remove it
// once Clean has its first real one.
func (*Clean) Ping() {}

// Status is the bound service behind the Status tab: live system health.
type Status struct{}

// Ping answers the page. MyGo binds only services with a method: remove it
// once Status has its first real one.
func (*Status) Ping() {}
