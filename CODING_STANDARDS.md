# Coding standards

Judgement calls for the Standards review. Tooling already enforces the mechanical rules (`bun run check`: golangci-lint, biome, `src/design-rules.test.ts`, actionlint, the em-dash check), so they are not repeated here. Terms follow `GLOSSARY.md`.

## Scope

Burrow is a local desktop app with no HTTP API, database or accounts. General rules about API envelopes, CSRF, rate limiting, the repository pattern or coverage percentages don't apply; skip them in review.

## Partial failure

A Scan or Clean finishes with what it can read and reports the rest. When a side check fails (listing running apps, removing one item, writing history), the engine logs it, falls back to the safe answer and carries on: it doesn't fail the whole run. The safe answer is the one that removes less, such as treating a lockable junk group as locked.

## Errors

- **Go**: the package that first returns an error prefixes it with its own name and the failed step, as in `fmt.Errorf("clean: listing running apps: %w", err)`, and wraps with `%w`. That includes `ctx.Err()` and sentinel errors such as `io.ErrUnexpectedEOF`. A caller that adds nothing returns it as is.
- **Logging**: an error that is handled by degrading is logged once, with `slog`, where the decision is made.
- **Frontend**: a rejection is dropped only when Go has already logged it, and the handler's comment says so (see `src/clean/useLockedGroups.ts`). Otherwise it reaches the UI through `src/strings.ts` text.

## Tests

- Use a table when the cases share setup and assertion. Each case gets a name, so a failure says which one. Use separate named tests when the setup differs. Both are fine; reject mixed shapes such as unnamed slices of inputs.
- A test reuses the production type or a `*test` helper package (`internal/clean/cleantest`, `internal/testhome`) and doesn't re-declare a wire or file format, such as history JSON, by hand.
- Test fakes return new values and don't change objects they were handed.
- Probe code goes in the scratchpad or a throwaway branch, never in a package of the repo.

## Test hooks in the shipped app

Anything that lets a test drive the built app (such as `internal/automation`) stays off unless its environment variable is set, and its doc comment says what it exposes. A review flags any new hook that widens what the shipped app accepts.
