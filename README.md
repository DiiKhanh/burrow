# Burrow

Burrow is a free, open-source macOS app (Apple Silicon) that frees disk space and shows the live health of your Mac.

- **Clean** scans for junk, lets you review it group by group down to single paths, and removes only what you pick. Caches and logs are deleted; things you might miss go to the Trash.
- **Status** shows CPU, memory, network, battery, disk and thermal health, refreshed every second.

Burrow is a work in progress. See the [v1 spec](https://github.com/DiiKhanh/burrow/issues/16).

## Credits

Burrow is built on [Mole](https://github.com/tw93/mole) by [tw93](https://github.com/tw93). Mole finds the junk and reads the system's health; Burrow bundles a pinned version of it and adds the interface and the removal. Thank you to Mole and its contributors.

Burrow is not affiliated with Mole or Mole for Mac and uses none of their assets.

## Develop

You need [Go](https://go.dev/dl/) (the `toolchain` line of `go.mod` fetches the pinned version) and [Bun](https://bun.sh) (the version in `packageManager` of `package.json`).

```sh
bun install                 # also fetches the pinned Mole into resources/
bun run dev                 # the app, with live reload
bun run build               # Burrow.app and a DMG in build/darwin-arm64/
bun run check               # lint, typecheck and unit tests, Go and TypeScript
bun run test:integration    # Go integration tests
bun run test:e2e            # Playwright, against the UI with a fake Go client
bun run test:smoke          # launches the built app
bun run test:realtrash      # moves a temp file into your real Trash; never in CI
```

Burrow ships its own Mole: `mole.lock` pins the release and the SHA-256 of what Burrow downloads, and `bun run fetch:mole` installs it, failing on any checksum mismatch. The source checksum is that of GitHub's archive of the tag; should GitHub ever regenerate it, the fetch fails safe and the lock needs a reviewed re-pin. `dev`, `build` and the tests fetch it first. To move to another release, run `go run ./tools/fetchmole -update V1.63.0` and review the diff of `mole.lock`; the integration tests must pass in the same PR.

These scripts are the only entry points; CI runs the same ones. The app is built with [MyGo](https://github.com/egoist/mygo): the Go side is in `main.go` and `internal/`, the React frontend in `src/`, and `src/mygo.ts` is generated from the Go services by `bun run generate`.

## Release

1. Set `version` in `mygo.config.ts` (X.Y.Z) and merge it.
2. Push the tag `v` plus that version: `git tag v0.2.0 && git push origin v0.2.0`. A tag such as `v0.2.0-rc.1` publishes a pre-release of `0.2.0`, to try the pipeline.

`.github/workflows/release.yml` fails on any other tag before building, runs all of CI, builds the app signed ad hoc, smoke tests it, and publishes its DMG and `SHA256SUMS` as a GitHub release. The install guide of `.github/release-notes.md` comes above notes generated from the merged PRs: there is no hand-written changelog. To sign with another identity, set the repository variable `MACOS_SIGNING_IDENTITY` and add a step importing that identity into the runner's keychain before the build.

Architecture decisions are in [`docs/adr/`](docs/adr/) and the domain language in [`GLOSSARY.md`](GLOSSARY.md).

## License

[GPL-3.0](LICENSE).
