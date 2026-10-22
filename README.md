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
bun install
bun run dev                 # the app, with live reload
bun run build               # Burrow.app and a DMG in build/darwin-arm64/
bun run check               # lint, typecheck and unit tests, Go and TypeScript
bun run test:integration    # Go integration tests
bun run test:e2e            # Playwright, against the UI with a fake Go client
bun run test:smoke          # launches the built app
```

These scripts are the only entry points; CI runs the same ones. The app is built with [MyGo](https://github.com/egoist/mygo): the Go side is in `main.go` and `internal/`, the React frontend in `src/`, and `src/mygo.ts` is generated from the Go services by `bun run generate`.

Architecture decisions are in [`docs/adr/`](docs/adr/) and the domain language in [`GLOSSARY.md`](GLOSSARY.md).

## License

[GPL-3.0](LICENSE).
