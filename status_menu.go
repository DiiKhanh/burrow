package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/DiiKhanh/burrow/internal/engine"
	"github.com/DiiKhanh/burrow/internal/mole"
	"github.com/DiiKhanh/burrow/internal/service"
	"github.com/egoist/mygo"
)

var metrics = []string{"cpu", "memory", "network", "thermal"}

// Status owns the four native items and their shared panel on MyGo's UI thread.
type Status struct {
	win, panel      *mygo.Window
	items           map[string]*mygo.Tray
	watcher         *engine.StatusWatcher
	detailWorkers   sync.WaitGroup
	rendered        map[string]menuAppearance
	path            string
	staleTimer      *time.Timer
	latest          *engine.Snapshot
	shown, quitting bool
	panelMetric     string
	detailContext   context.Context
	cancelDetail    context.CancelFunc
}

func (s *Status) start(win *mygo.Window, w *engine.StatusWatcher, home string) {
	s.rendered = make(map[string]menuAppearance)
	s.win = win
	s.watcher = w
	s.path = filepath.Join(home, "Library", "Application Support", "Burrow", "status-menu.json")
	data, err := os.ReadFile(s.path)
	if err == nil {
		var enabled []string
		if err = json.Unmarshal(data, &enabled); err == nil {
			for _, key := range enabled {
				if slices.Contains(metrics, key) && s.items[key] == nil {
					if e := s.add(key); e != nil {
						slog.Warn("restoring menu item", "metric", key, "error", e)
					}
				}
			}
		}
	}
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		slog.Warn("reading Status menu preferences", "error", err)
	}
	show := func() { s.shown = true; s.demand() }
	hide := func() { s.shown = false; s.demand() }
	win.OnShow(show)
	win.OnRestore(show)
	win.OnHide(hide)
	win.OnMinimize(hide)
	win.OnClosed(hide)
	win.OnClose(func(e *mygo.CloseEvent) {
		if !s.quitting && len(s.items) > 0 {
			e.PreventDefault()
			win.Hide()
		}
	})
	mygo.App.OnBeforeQuit(func(*mygo.QuitEvent) {
		s.quitting = true
		s.demand()
		if s.cancelDetail != nil {
			s.cancelDetail()
		}
	})
	s.shown = win.IsVisible() && !win.IsMinimized()
	s.demand()
}
func (s *Status) demand() {
	if !s.quitting && (s.shown || len(s.items) > 0) {
		s.watcher.Start()
		return
	}
	s.watcher.Stop()
	s.latest = nil
	if s.staleTimer != nil {
		s.staleTimer.Stop()
	}
}

func (s *Status) publish(snapshot engine.Snapshot) {
	mygo.RunOnMain(func() {
		if s.quitting || (!s.shown && len(s.items) == 0) {
			return
		}
		if s.staleTimer != nil {
			s.staleTimer.Stop()
		}
		s.latest = &snapshot
		if snapshot.Collector == engine.CollectorRunning {
			s.staleTimer = time.AfterFunc(4*time.Second, func() {
				mygo.RunOnMain(func() {
					if s.latest != &snapshot {
						return
					}
					stale := snapshot
					stale.Collector = engine.CollectorStale
					s.publish(stale)
				})
			})
		}
		for key, tray := range s.items {
			s.drawMenu(tray, key)
		}
		service.BroadcastStatus(snapshot)
	})
}

func (s *Status) Latest() (snapshot *engine.Snapshot) {
	mygo.RunOnMain(func() { snapshot = s.latest })
	return
}
func (s *Status) Enabled() (enabled []string) {
	mygo.RunOnMain(func() {
		for _, key := range metrics {
			if s.items[key] != nil {
				enabled = append(enabled, key)
			}
		}
	})
	return
}

func (s *Status) SetEnabled(key string, on bool) (err error) {
	if !slices.Contains(metrics, key) {
		return errors.New("status: unknown menu item")
	}
	mygo.RunOnMain(func() {
		if s.win == nil {
			return
		}
		if (s.items[key] != nil) == on {
			return
		}
		if on {
			if err = s.add(key); err != nil {
				return
			}
		}
		enabled := s.Enabled()
		if !on {
			enabled = slices.DeleteFunc(enabled, func(k string) bool { return k == key })
		}
		if err = saveMenu(s.path, enabled); err != nil {
			if on {
				s.remove(key)
			}
			return
		}
		if !on {
			s.remove(key)
		}
		s.demand()
	})
	return
}

func saveMenu(path string, enabled []string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("status: creating preferences directory: %w", err)
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".status-menu-*")
	if err != nil {
		return fmt.Errorf("status: creating menu preferences: %w", err)
	}
	defer func() { _ = os.Remove(f.Name()) }()
	encodeErr := json.NewEncoder(f).Encode(enabled)
	if err = errors.Join(encodeErr, f.Close()); err == nil {
		err = os.Rename(f.Name(), path)
	}
	if err != nil {
		return fmt.Errorf("status: saving menu preferences: %w", err)
	}
	return nil
}

func (s *Status) add(key string) error {
	t, err := mygo.NewTray(mygo.TrayOptions{ID: "burrow.status." + key, ToolTip: "Burrow · " + key})
	if err != nil {
		return fmt.Errorf("status: creating menu item: %w", err)
	}
	s.items[key] = t
	s.drawMenu(t, key)
	t.OnAppearanceChange(func() { s.drawMenu(t, key) })
	t.OnClick(func() {
		if s.panel != nil {
			same := s.panelMetric == key
			s.panel.Close()
			if same {
				return
			}
		}
		panel := mygo.NewFlyout(mygo.FlyoutOptions{Tray: t, Placement: mygo.PlacementBottom, Width: 380, Height: 580, Focusable: true, Popover: true, URL: "/?panel=" + key})
		ctx, cancel := context.WithCancel(context.Background())
		s.panel = panel
		s.panelMetric = key
		s.detailContext = ctx
		s.cancelDetail = cancel
		panel.OnClosed(func() {
			cancel()
			if s.panel == panel {
				s.panel = nil
				s.panelMetric = ""
				s.cancelDetail = nil
			}
		})
	})
	return nil
}
func (s *Status) remove(key string) {
	if s.panel != nil && s.panelMetric == key {
		s.panel.Close()
	}
	s.items[key].Destroy()
	delete(s.items, key)
	delete(s.rendered, key)
}

func (s *Status) ShowWindow() (err error) {
	mygo.RunOnMain(func() {
		if s.panel != nil {
			s.panel.Close()
		}
		if s.win != nil {
			s.win.Restore()
			s.win.Show()
			s.win.Focus()
			err = service.OpenStatus.Emit(s.win, true)
		}
	})
	return
}

func (s *Status) detail(key string) context.Context {
	var ctx context.Context
	mygo.RunOnMain(func() {
		if s.panelMetric == key && !s.quitting {
			s.detailWorkers.Add(1)
			ctx = s.detailContext
		}
	})
	return ctx
}
func (s *Status) ResidentProcesses() ([]mole.Process, error) {
	if ctx := s.detail("memory"); ctx != nil {
		defer s.detailWorkers.Done()
		return mole.ResidentProcesses(ctx)
	}
	return nil, nil
}
func (s *Status) ApplicationTraffic() ([]mole.AppTraffic, error) {
	if ctx := s.detail("network"); ctx != nil {
		defer s.detailWorkers.Done()
		return mole.ApplicationTraffic(ctx)
	}
	return nil, nil
}

func menuTitle(key string, s *engine.Snapshot) string {
	var empty engine.Snapshot
	if s == nil {
		s = &empty
	}
	suffix := ""
	if s.Collector == engine.CollectorRetrying || s.Collector == engine.CollectorStale {
		suffix = " ⏸"
	}
	switch key {
	case "cpu":
		return menuNumber(s.CPU.Usage, "%") + suffix
	case "memory":
		return menuNumber(s.Memory.UsedPercent, "%") + suffix
	case "network":
		return "↑" + menuRate(s.Network.UploadBytesPerSecond) + "\n↓" + menuRate(s.Network.DownloadBytesPerSecond) + suffix
	default:
		return menuNumber(s.Thermal.CPUCelsius, "°C") + suffix
	}
}
func menuNumber(v *float64, unit string) string {
	if v == nil {
		return "-"
	}
	return fmt.Sprintf("%.0f%s", *v, unit)
}
func menuRate(v *float64) string {
	if v == nil {
		return "-"
	}
	value := *v
	for _, unit := range []string{"B/s", "KB/s", "MB/s", "GB/s"} {
		if value < 1000 || unit == "GB/s" {
			digits := 0
			if value < 10 && unit != "B/s" {
				digits = 1
			}
			return strconv.FormatFloat(value, 'f', digits, 64) + unit
		}
		value /= 1000
	}
	return "-"
}

type menuAppearance struct {
	value string
	dark  bool
}

func (s *Status) drawMenu(tray *mygo.Tray, key string) {
	label := map[string]string{"cpu": "CPU", "memory": "RAM", "network": "NET", "thermal": "TEMP"}[key]
	value := menuTitle(key, s.latest)
	appearance := menuAppearance{value, tray.Dark()}
	if s.rendered[key] == appearance {
		return
	}
	tip := label + " " + strings.ReplaceAll(value, "\n", " ")
	icon := menuImage(label, value, appearance.dark)
	if len(icon) == 0 {
		tray.SetTitle(tip)
		return
	}
	if err := tray.SetIcon(icon, false); err != nil {
		slog.Warn("drawing Status menu item", "error", err)
		tray.SetTitle(tip)
		return
	}
	tray.SetToolTip(tip)
	s.rendered[key] = appearance
}
