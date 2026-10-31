# Burrow

Burrow is a macOS cleaner app with a GUI, built on top of Mole (https://github.com/tw93/mole).

## Language

**Burrow**:
This app: a macOS desktop app that frees disk space, shows what takes it up, and shows system health.
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

**Device Firmware**:
A junk group containing downloaded Apple device firmware packages. It does not include device backups.
_Avoid_: Device Backups & Firmware

**Locked junk group**:
A junk group that cannot be selected right now because the app that owns it is running.
_Avoid_: Disabled group, blocked group

**Unreadable junk group**:
A junk group that macOS privacy protection kept the Scan from reading in full during that Scan, shown in Review as "Protected access unavailable". It says nothing about whether Full Disk Access is on: Burrow cannot check that.
_Avoid_: Blocked group, missing FDA

**Delete**:
Removing a junk item for good, freeing its space immediately.
_Avoid_: Purge, wipe, erase

**Move to Trash**:
Removing a junk item into the macOS Trash, where it can still be put back; its space is freed only when the Trash is emptied.
_Avoid_: Soft delete, recycle

**Skipped item**:
A selected junk item that Clean did not remove, always with a reason (in use, permission denied, protected, already gone).
_Avoid_: Failed item, error

**Space**:
The feature that shows what takes up disk space on the Mac, folder by folder, and lets the user move what they pick under their home folder to the Trash.
_Avoid_: Analyze, Disk, Space Lens

**Measure**:
The step of Space that computes the size of one folder's contents, or of the machine-wide overview, without removing anything.
_Avoid_: Scan, analyze, index

**Space item**:
One file or folder shown in Space with its size. Unlike a junk item, nothing proposed it for removal.
_Avoid_: Entry, node, junk item

**Unreadable Space item**:
A Space item a Measure could not read at all, shown as "Protected access unavailable" with no size, left out of the total, and not opened. Mole does not say why, so the cause may be something other than macOS privacy protection, such as the folder's own permissions.
_Avoid_: Blocked item, empty item

**Partly unreadable Space item**:
A Space item a Measure could read only part of, shown with its size and a "Partly unreadable" note: the size may be low.
_Avoid_: Partial item, incomplete item

**Insight**:
A named location that Mole flags as commonly taking hidden space (e.g. iOS Backups, Old Downloads), shown in the Space overview.
_Avoid_: Suggestion, hint, hotspot

**Status**:
The feature that shows live system health of the Mac.
_Avoid_: Dashboard, monitor

**Health score**:
A 0-100 summary of the Mac's current condition, with a one-line reason, as computed by Mole.
_Avoid_: Health, rating, grade
