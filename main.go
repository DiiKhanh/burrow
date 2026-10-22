// Burrow frees disk space and shows system health on macOS. This file only
// wires the app: it binds the services and opens the window.
package main

import (
	"fmt"
	"log"
	"log/slog"
	"os"

	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/mole"
	"github.com/DiiKhanh/burrow/internal/service"
	"github.com/egoist/mygo"
)

// windowBackground is the bottom of the Clean gradient (--color-clean-bottom
// in src/styles.css), shown until the page paints.
const windowBackground = "#1b1f31"

func main() {
	cleanService, configureClean := service.NewClean()
	mygo.Bind(cleanService, &service.Status{})
	mygo.Theme.SetSource(mygo.ThemeDark)

	mygo.App.WhenReady(func() {
		// Checked once the app runs: `mygo generate` runs main without resources.
		bundle, err := locateMole()
		if err != nil {
			log.Fatalf("starting Burrow: %v", err)
		}
		home, err := os.UserHomeDir()
		if err != nil {
			log.Fatalf("finding the user's home: %v", err)
		}
		configureClean(clean.NewEngine(mole.NewScanner(bundle, home, slog.Default())))
		mygo.NewWindow(mygo.WindowOptions{
			Title:           "Burrow",
			Width:           1100,
			Height:          760,
			MinWidth:        760,
			MinHeight:       560,
			BackgroundColor: windowBackground,
			// The traffic lights sit over the page, which draws everything else.
			TitleBarStyle:        mygo.TitleBarHidden,
			TrafficLightPosition: &mygo.Point{X: 18, Y: 18},
			StateKey:             "main",
			URL:                  "/",
		})
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatalf("running Burrow: %v", err)
	}
}

// locateMole finds the Mole release Burrow ships, never one the user installed.
func locateMole() (mole.Bundle, error) {
	resources, err := mygo.App.Path(mygo.PathResources)
	if err != nil {
		return mole.Bundle{}, fmt.Errorf("finding the app's resources: %w", err)
	}
	return mole.Locate(resources)
}
