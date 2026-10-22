# PROTOTYPE: Burrow UI (Clean + Status)

Throwaway. Answers [Prototype giao diện Clean và Status theo Mole for Mac](https://github.com/DiiKhanh/cleaner-app/issues/8). Lives only on branch `prototype/ui-clean-status`, never merged.

```sh
cd prototypes/ui && npm install && npm run dev
```

Switch variants with `?variant=A|B|C` (or ← → keys / the pink bar), tabs with `?tab=clean|status` (or ⌘1 / ⌘2). All data is mock and in memory; nothing touches the disk.

- **A, Faithful**: Mole for Mac's structure. Hero rings + big number, full-window review overlay with group cards, rolling cleaning list; Status as 4x2 bento + process table.
- **B, Workspace**: no hero, no overlay. Persistent two-pane layout: group rail with Clean button on the left, item table of the selected group on the right; Status as a vitals column + full-height process table.
- **C, Guided**: one narrow column with a Scan → Review → Clean → Done stepper and a storage bar of the selection; Status focuses on one large chart chosen by metric chips.
