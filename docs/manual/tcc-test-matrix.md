# Full Disk Access test matrix (manual)

Burrow cannot read or grant Full Disk Access (issue #12): no API reports it,
and Burrow never reads the TCC database or runs `tccutil reset`. Review only
shows "Protected access unavailable" for junk groups the Scan was actually
refused (issue #25). This matrix checks that on a real macOS privacy setup.

**Run it only on a clean VM or a restored snapshot, never on a personal Mac.**
Every row changes privacy settings, and TCC state is hard to undo by hand.

## Setup

1. Restore a clean macOS snapshot (current release, and the oldest supported).
2. Put files in the Trash, and fill `~/Library/Caches` with a few MB.
3. Copy the build under test to `/Applications` and remove its quarantine
   attribute as the friends' install guide says (issue #5).
4. Take a snapshot named `burrow-tcc-baseline` and restore it before each row.

## Matrix

| # | Full Disk Access for Burrow | Steps | Expected |
|---|---|---|---|
| 1 | Never granted | Open Burrow, Start scan | Review lists the readable groups. Trash shows "Protected access unavailable", with no checkbox. The Full Disk Access notice shows. |
| 2 | Never granted | Row 1, then Open System Settings | System Settings opens on Privacy & Security › Full Disk Access. The notice says to turn on Burrow and scan again. |
| 3 | Granted | Turn Burrow on in Full Disk Access, accept Quit & Reopen, Start scan | Trash lists its items. No "Protected access unavailable", no notice. |
| 4 | Granted, then turned off | Row 3, turn Burrow off, reopen it, Start scan | Same as row 1. |
| 5 | Granted, then app replaced | Row 3, copy a new build over `/Applications/Burrow.app`, Start scan | Record whether Trash is readable. An ad-hoc signature changes with each build, so expect row 1 (issue #12). |
| 6 | Never granted, Trash empty | Empty the Trash first, Start scan | Trash still shows "Protected access unavailable": macOS refuses the listing whether or not the Trash has items. |
| 7 | Never granted | Make a cache folder `chmod 000`, Start scan | That folder's group is not marked unreadable: a file-mode refusal is not privacy protection. |
| 8 | Direct link not honored | On each tested macOS release, Open System Settings | Record which pane opens. macOS reports a failure only when no app opens the link, which makes Burrow open Privacy & Security and explain how to find Full Disk Access. An anchor macOS ignores leaves System Settings on another pane without telling Burrow, so the link needs changing. |

## Known limits

- Mole skips most paths it cannot read without a word: only Trash is named.
  Burrow also marks a group when it gets `EPERM` sizing an item Mole listed,
  but a folder Mole never listed (another app's container, for example)
  leaves its group looking complete. Note any group that grows after Full
  Disk Access is granted (row 3 against row 1).
- macOS reports a link failure only when no app opens it, so an ignored
  anchor is caught by row 8, not by Burrow.

## Recording results

Add one line per run under the table: date, macOS version and build, Burrow
commit, the row numbers that passed, and what failed.
