package mole

import "math"

type Sensor struct {
	Name    string  `json:"name"`
	Celsius float64 `json:"celsius"`
}
type StatusDetails struct {
	PerCore       []float64 `json:"perCore"`
	User          *float64  `json:"user"`
	System        *float64  `json:"system"`
	Cached        *uint64   `json:"cached"`
	Available     *uint64   `json:"available"`
	Interfaces    []Network `json:"interfaces"`
	ThermalSource string    `json:"thermalSource"`
	Sensors       []Sensor  `json:"sensors"`
}

func (d *StatusDetails) addSensor(name string, value *float64) {
	if value != nil && *value > 0 && !math.IsInf(*value, 0) {
		d.Sensors = append(d.Sensors, Sensor{name, *value})
	}
}
