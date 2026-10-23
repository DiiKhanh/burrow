// Command testhome generates Burrow's deterministic fake HOME and prints its
// expected Scan manifest as JSON for smoke-test setup.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/DiiKhanh/burrow/internal/testhome"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: go run ./tools/testhome <absolute-home>")
		os.Exit(2)
	}
	home, err := filepath.Abs(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	manifest, err := testhome.Generate(home)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := json.NewEncoder(os.Stdout).Encode(manifest); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
