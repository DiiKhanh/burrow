// Burrow frees disk space and shows system health on macOS. This file only
// wires the app: it binds the services and opens the window.
package main

import (
	"log"

	"github.com/DiiKhanh/burrow/internal/service"
	"github.com/egoist/mygo"
)

// windowBackground is the bottom of the Clean gradient (--color-clean-bottom
// in src/styles.css), shown until the page paints.
const windowBackground = "#1b1f31"

func main() {
	mygo.Bind(&service.Clean{}, &service.Status{})
	mygo.Theme.SetSource(mygo.ThemeDark)

	mygo.App.WhenReady(func() {
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
