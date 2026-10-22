// Command fetchmole puts the Mole release that mole.lock pins into the
// app's resources, after checking it against the lock's checksums.
//
//	go run ./tools/fetchmole                   # install, or keep, the pinned release
//	go run ./tools/fetchmole -update V1.63.0   # pin another release, then install it
package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"time"

	"github.com/DiiKhanh/burrow/internal/mole"
)

const (
	moleRepository = "https://github.com/tw93/mole"
	timeout        = 5 * time.Minute
)

func main() {
	lockPath := flag.String("lock", "mole.lock", "the lock file")
	dest := flag.String("dest", filepath.Join("resources", "darwin-arm64", mole.Dir), "where the bundle goes")
	update := flag.String("update", "", "pin this release (e.g. V1.63.0) in the lock file before installing")
	flag.Parse()

	if err := run(*lockPath, *dest, *update); err != nil {
		fmt.Fprintln(os.Stderr, "fetchmole:", err)
		os.Exit(1)
	}
}

func run(lockPath, dest, update string) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	f := fetcher{baseURL: moleRepository, client: http.DefaultClient, log: os.Stdout}
	if update != "" {
		lock, err := f.pin(ctx, update)
		if err != nil {
			return err
		}
		if err := writeLock(lockPath, lock); err != nil {
			return err
		}
		fmt.Printf("Pinned Mole %s in %s: review its diff before committing\n", lock.Version, lockPath)
	}
	lock, err := readLock(lockPath)
	if err != nil {
		return err
	}
	return f.install(ctx, lock, dest)
}
