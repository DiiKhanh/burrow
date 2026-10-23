# Scan End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver ticket #20 so Burrow scans a generated fake HOME through the bundled Mole, returns stable coded junk groups, streams cancellable progress, and renders the Strata Scan flow through completion.

**Architecture:** `internal/clean` owns the Scan contract and single-flight engine. `internal/mole` adapts the pinned process and clean-list format into that contract, while `internal/service` only bridges progress into a MyGo channel. React consumes generated types, translates group codes through the string catalog, and drives the chosen Strata interface with a scripted client at its browser seam.

**Tech Stack:** Go 1.27, MyGo 0.6.2, React 19, TypeScript 7, Tailwind CSS 4, Vitest, Playwright WebKit

**Spec:** GitHub issue #20, parent spec #16, ADR 0001-0003

## Global Constraints

- The bundled Mole V1.62.0 and injected Home are the only executable and home used by Scan.
- Burrow may read Mole's whitelist and overwrite `clean-list.txt`, but must never write the whitelist.
- Engine and IPC expose `JunkGroupID`; Mole section names never reach visible UI.
- Device Firmware accepts only `.ipsw` and uses the exact description "Downloaded iPhone and iPad firmware files."
- System, Time Machine, and External volume are excluded; Large files and Project artifacts are hidden.
- Unknown Mole sections are ignored and logged. The pinned-version integration test must report none.
- Closing the MyGo channel cancels the context and terminates the Mole process. Only one Scan may run at a time.
- Every user-visible string and every component color, size, radius, and shadow uses the existing catalogs and design tokens.
- Tests create HOME trees in temporary directories and never touch the real home folder.

## Review Focus

- A clean-list path containing `#`, spaces, or non-ASCII text remains intact and receives a stable id.
- A `counted under` child does not become a second junk item or inflate group bytes.
- An unreadable or disappearing candidate does not crash the scan or borrow Mole's human-readable size.
- A cancelled scan releases the single-flight guard so a later scan can start.
- A late progress event after Cancel cannot move the UI back into scanning or results.

---

### Task 1: Generated HOME Fixture and Mole Adapter

**Files:**
- Create: `internal/testhome/testhome.go`
- Create: `tools/testhome/main.go`
- Create: `internal/mole/scan.go`
- Create: `internal/mole/scan_test.go`
- Create: `internal/mole/testdata/clean-list.txt`
- Modify: `internal/mole/bundle_integration_test.go`

**Interfaces:**
- Consumes: `mole.Bundle.Mo()` and an injected absolute Home.
- Produces: `mole.Scanner.Scan(context.Context, func(clean.ScanProgress) error) (clean.ScanResult, error)` and `mole.ParseCleanList(Home, io.Reader, *slog.Logger) (clean.ScanResult, error)`.

- [ ] Add one golden parser test for section mapping, odd paths, unknown sizes, `counted under`, `.ipsw` filtering, stable ids, and filesystem-recomputed bytes; run it red.
- [ ] Implement the minimum parser and mapping table, including `Apple Silicon updates -> app-caches`; run the single test green.
- [ ] Add a generated HOME fixture test and CLI contract; run it red, implement it, then run green.
- [ ] Add adapter process tests for injected HOME, streamed mapped progress, cancellation, and no whitelist writes one behavior at a time.
- [ ] Add the real bundled-Mole integration test: generate HOME, scan it, compare the expected item set, and fail if the pinned run logs an unmapped section.
- [ ] Run `go test ./internal/mole ./internal/testhome` and `go test -tags integration ./internal/mole`.

### Task 2: Scan Engine and Single-Flight Contract

**Files:**
- Create: `internal/clean/scan.go`
- Create: `internal/clean/scan_test.go`

**Interfaces:**
- Consumes: a `clean.Scanner` adapter injected into `clean.NewEngine`.
- Produces: `Engine.Scan(context.Context, func(ScanProgress) error) (ScanResult, error)` and `ErrScanInProgress`.

- [ ] Write a public-seam test that Scan returns the adapter result and forwards progress; run it red and implement the minimum path.
- [ ] Write a concurrent-scan test; run it red and implement single-flight exclusion.
- [ ] Write a cancellation/retry test; run it red and ensure the guard is released on every exit.
- [ ] Run `go test -race ./internal/clean` and `go test ./internal/mole ./internal/clean`.

### Task 3: MyGo Scan Service and Generated Client

**Files:**
- Modify: `internal/service/service.go`
- Modify: `main.go`
- Regenerate: `src/mygo.ts`
- Modify: `src/testing/mygo.fake.ts`
- Modify: `src/testing/mygo.fake.test.ts`

**Interfaces:**
- Consumes: configured `*clean.Engine`, request context, and `*mygo.Channel[clean.ScanProgress]`.
- Produces: `Clean.Scan(progressChannel): Promise<ScanResult>` in generated TypeScript.

- [ ] Add a compile-time fake-client test for the Scan shape; run it red.
- [ ] Bind `Clean.Scan`, configure it with bundled Mole and the OS home in app wiring, and translate closed-channel sends into cancellation.
- [ ] Run `bun run generate`, then run `go test ./internal/service ./...` and `bun test src/testing/mygo.fake.test.ts`.

### Task 4: Strata Scan UI and Browser Flow

**Files:**
- Create: `src/clean/catalog.ts`
- Create: `src/clean/ScanStrata.tsx`
- Create: `src/clean/CleanTab.test.tsx`
- Modify: `src/clean/CleanTab.tsx`
- Modify: `src/strings.ts`
- Modify: `src/styles.css`
- Modify: `src/testing/mygo.fake.ts`
- Create: `e2e/scan.spec.ts`

**Interfaces:**
- Consumes: generated `Clean.scan`, progress values, and `ScanResult` group codes.
- Produces: idle Scan call-to-action, determinate/indeterminate Strata, live bytes/path, Cancel, and completed group-size list.

- [ ] Write the RTL idle-to-scanning tracer test; run it red and implement the smallest Clean flow.
- [ ] Add one RTL behavior at a time for mapped labels, determinate and indeterminate progress, cancellation, stale-event protection, and completed group sizes.
- [ ] Script the fake MyGo client for running, indeterminate, cancel, and completed cases.
- [ ] Add Playwright cases that drive Start Scan and verify Strata, indeterminate state, Cancel, and completion at 1100x760.
- [ ] Run `bun test src/clean/CleanTab.test.tsx`, `bun run check:web`, and `bun run test:e2e`.

### Task 5: Verification, Two-Axis Review, and Commit

**Files:**
- Modify only files required by review findings.

**Interfaces:**
- Consumes: ticket #20, parent #16, documented repo standards, and the complete branch diff.
- Produces: verified implementation committed on the current branch.

- [ ] Run `bun run check`, `bun run test:integration`, and `bun run test:e2e` from fresh commands.
- [ ] Inspect the final UI at the target viewport and correct visible regressions.
- [ ] Run the `code-review` skill against the pre-work commit on Standards and Spec axes; fix material findings and rerun affected/full verification.
- [ ] Commit all ticket files with a conventional message referencing #20, without editing generated changelogs or adding an agent co-author.
