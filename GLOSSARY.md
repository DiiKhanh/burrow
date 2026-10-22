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

**Locked junk group**:
A junk group that cannot be selected right now because the app that owns it is running.
_Avoid_: Disabled group, blocked group

**Delete**:
Removing a junk item for good, freeing its space immediately.
_Avoid_: Purge, wipe, erase

**Move to Trash**:
Removing a junk item into the macOS Trash, where it can still be put back; its space is freed only when the Trash is emptied.
_Avoid_: Soft delete, recycle

**Skipped item**:
A selected junk item that Clean did not remove, always with a reason (in use, permission denied, protected, already gone).
_Avoid_: Failed item, error

**Status**:
The feature that shows live system health of the Mac.
_Avoid_: Dashboard, monitor

**Health score**:
A 0-100 summary of the Mac's current condition, with a one-line reason, as computed by Mole.
_Avoid_: Health, rating, grade
