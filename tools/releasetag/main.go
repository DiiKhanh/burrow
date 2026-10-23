// Command releasetag checks a release tag against the version in
// mygo.config.ts and prints, as GitHub Actions step outputs, what the
// release workflow publishes. It fails on a tag that does not match.
//
//	go run ./tools/releasetag v0.1.0        # version=0.1.0, prerelease=false
//	go run ./tools/releasetag v0.1.0-rc.1   # version=0.1.0-rc.1, prerelease=true
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"time"
)

const timeout = time.Minute

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: releasetag vX.Y.Z[-prerelease]")
		os.Exit(2)
	}
	if err := run(os.Args[1]); err != nil {
		fmt.Fprintln(os.Stderr, "releasetag:", err)
		os.Exit(1)
	}
}

func run(tag string) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	version, err := appVersion(ctx, ".")
	if err != nil {
		return err
	}
	rel, err := parseTag(tag, version)
	if err != nil {
		return err
	}
	fmt.Printf("version=%s\nprerelease=%t\n", rel.Version, rel.Prerelease)
	return nil
}
