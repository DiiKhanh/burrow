// Which junk items Review has selected. A selection is an immutable set of
// junk item ids; every change returns a new one.
import type { JunkGroup, JunkGroupID, ScanResult } from "../mygo";

export type Selection = ReadonlySet<string>;

/** How much of a junk group is selected, as its tri-state checkbox shows it. */
export type GroupState = "all" | "some" | "none";

/** Every item of the groups the engine marks as selected by default. */
export function defaultSelection(result: ScanResult): Selection {
  return new Set(result.groups.filter((group) => group.defaultSelected).flatMap(itemIds));
}

/**
 * The part of selection Clean may take: none of the items of a locked junk
 * group. The rest of selection stays, so a group unlocks as it was.
 */
export function withoutLocked(
  selection: Selection,
  groups: readonly JunkGroup[],
  locked: ReadonlySet<JunkGroupID>,
): Selection {
  const lockedIds = new Set(groups.filter((group) => locked.has(group.id)).flatMap(itemIds));
  if (lockedIds.size === 0) return selection;
  return new Set([...selection].filter((id) => !lockedIds.has(id)));
}

export function groupState(group: JunkGroup, selection: Selection): GroupState {
  const count = selectedIn(group, selection).length;
  if (count === 0) return "none";
  return count === group.items.length ? "all" : "some";
}

/** Selects or clears every item of group. */
export function setGroup(selection: Selection, group: JunkGroup, on: boolean): Selection {
  const ids = itemIds(group);
  if (on) return new Set([...selection, ...ids]);
  const cleared = new Set(ids);
  return new Set([...selection].filter((id) => !cleared.has(id)));
}

/** Selects the item if it was clear, clears it if it was selected. */
export function toggleItem(selection: Selection, itemId: string): Selection {
  if (selection.has(itemId)) return new Set([...selection].filter((id) => id !== itemId));
  return new Set([...selection, itemId]);
}

/** The selected items of group. */
export function selectedIn(group: JunkGroup, selection: Selection) {
  return group.items.filter((item) => selection.has(item.id));
}

export function selectedBytes(group: JunkGroup, selection: Selection): number {
  return sumBytes(selectedIn(group, selection));
}

export function groupBytes(group: JunkGroup): number {
  return sumBytes(group.items);
}

function sumBytes(items: JunkGroup["items"]): number {
  return items.reduce((sum, item) => sum + item.bytes, 0);
}

function itemIds(group: JunkGroup): string[] {
  return group.items.map((item) => item.id);
}
