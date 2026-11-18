// Burrow frees disk space and shows system health on macOS. This file only
// wires the app: it binds the services and opens the window.
package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"os"

	"github.com/DiiKhanh/burrow/internal/automation"
	"github.com/DiiKhanh/burrow/internal/clean"
	"github.com/DiiKhanh/burrow/internal/engine"
	"github.com/DiiKhanh/burrow/internal/mole"
	"github.com/DiiKhanh/burrow/internal/removal"
	"github.com/DiiKhanh/burrow/internal/service"
	"github.com/DiiKhanh/burrow/internal/space"
	"github.com/egoist/mygo"
)

// windowBackground is the bottom of the Clean gradient (--color-clean-bottom
// in src/styles.css), shown until the page paints.
const windowBackground = "#1b1f31"

func main() {
	cleanService, configureClean := service.NewClean()
	spaceService, configureSpace := service.NewSpace()
	status := &Status{items: make(map[string]*mygo.Tray)}
	mygo.Bind(cleanService, spaceService, service.NewPrivacy(mygo.Shell.OpenExternal), status)
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
		remover := removal.OSRemover{Trash: trashFor(home)}
		configureClean(clean.NewEngine(clean.Options{
			Scanner:   mole.NewScanner(bundle, home, slog.Default()),
			Home:      home,
			Remover:   remover,
			Processes: removal.OSProcesses{},
			Logger:    slog.Default(),
		}))
		configureSpace(space.NewEngine(space.Options{
			Measurer:  mole.NewMeasurer(bundle, home, slog.Default()),
			Home:      home,
			Reveal:    mygo.Shell.ShowItemInFolder,
			Remover:   remover,
			Processes: removal.OSProcesses{},
			Logger:    slog.Default(),
		}))
		win := mygo.NewWindow(mygo.WindowOptions{
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
		statusSource := func(ctx context.Context, yield func(mole.StatusSample)) error {
			return bundle.WatchStatus(ctx, home, yield)
		}
		status.start(win, engine.NewStatusWatcher(statusSource, status.publish), home)
		if os.Getenv(automation.Env) == "1" {
			go serveAutomation(win.Page())
		}
	})
	err := mygo.App.Run()
	if status.watcher != nil {
		status.watcher.Shutdown()
		status.detailWorkers.Wait()
	}
	if err != nil {
		log.Fatalf("running Burrow: %v", err)
	}
}

// serveAutomation lets the process that launched Burrow run scripts in page,
// as the built-app smoke test does, and quits once that process closes its
// end of the pipes.
func serveAutomation(page *mygo.Page) {
	requests := os.NewFile(automation.RequestsFD, "automation requests")
	responses := os.NewFile(automation.ResponsesFD, "automation responses")
	if err := automation.Serve(context.Background(), requests, responses, page.EvalContext); err != nil {
		log.Printf("serving automation: %v", err)
	}
	mygo.App.Quit()
}

// locateMole finds the Mole release Burrow ships, never one the user installed.
func locateMole() (mole.Bundle, error) {
	resources, err := mygo.App.Path(mygo.PathResources)
	if err != nil {
		return mole.Bundle{}, fmt.Errorf("finding the app's resources: %w", err)
	}
	return mole.Locate(resources)
}
