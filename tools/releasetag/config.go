package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

// versionLoader prints the version of mygo.config.ts in the working
// directory as JSON, on its last line: whatever the configuration itself
// prints comes before. A configuration exporting a function gets the build
// command, as `mygo build` calls it.
const versionLoader = `
import { pathToFileURL } from "node:url";

const mod = await import(pathToFileURL("mygo.config.ts").href);
let config = await mod.default;
if (typeof config === "function") config = await config({ command: "build" });
console.log(JSON.stringify(config?.version ?? null));
`

// appVersion returns the version set in dir/mygo.config.ts, evaluated by Bun.
func appVersion(ctx context.Context, dir string) (string, error) {
	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "bun", "--eval", versionLoader)
	cmd.Dir = dir
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("evaluating mygo.config.ts: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	var version *string
	if err := json.Unmarshal([]byte(lines[len(lines)-1]), &version); err != nil {
		return "", fmt.Errorf("reading the version of mygo.config.ts: %w", err)
	}
	if version == nil {
		return "", errors.New("mygo.config.ts sets no version")
	}
	return *version, nil
}
