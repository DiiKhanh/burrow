## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### MyGo

MyGo (the app framework) docs are in `$(go list -m -f '{{.Dir}}' github.com/egoist/mygo)/docs/`; `mygo.config.ts` types are in `node_modules/mygo-cli/index.d.ts`.
