# Burrow

Burrow is a macOS cleaner app with a GUI, built on top of Mole (https://github.com/tw93/mole).

## Language

**Burrow**:
This app: a macOS desktop app that frees disk space and shows system health.
_Avoid_: Mole, cleaner-app

**Mole**:
The open-source upstream CLI (`mo`) that Burrow builds on. "Mole for Mac" is its separate proprietary GUI app, used only as a UI reference.
_Avoid_: upstream, the CLI

**Clean**:
The feature that finds reclaimable junk on the Mac, previews it, and removes what the user picks.
_Avoid_: Cleanup, sweep, purge

**Scan**:
The step of Clean that finds junk items without removing anything.
_Avoid_: Dry run, analyze

**Junk item**:
One path that a Scan proposes for removal, with its size.
_Avoid_: Entry, file, target

**Junk group**:
A named category of junk items (e.g. Browsers, Developer tools) that the user can select as a whole.
_Avoid_: Section, category

**Status**:
The feature that shows live system health of the Mac.
_Avoid_: Dashboard, monitor
