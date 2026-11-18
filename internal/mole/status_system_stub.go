//go:build !darwin || !cgo

package mole

// Builds of the Mole tooling outside macOS can still decode captured samples.
type systemReadings struct{}

func (*systemReadings) update(*StatusSample) {}
