// Which Space items are picked, across every folder of the session. Picks are
// an immutable set of ids; Go gives an item the same id for its path, so they
// outlive a new Measure. What a picked id means now comes from the results.
import type { GroupState } from "../clean/selection";
import type { LockedItem, MeasureResult, SpaceItem } from "../mygo";
import { allItems, isAtOrInside, isInside } from "./results";

export type Picks = ReadonlySet<string>;

/** Every Space item the results list by id, each as last measured. */
export function listedItems(results: Iterable<MeasureResult>): ReadonlyMap<string, SpaceItem> {
  const oldestFirst = [...results].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  return new Map(oldestFirst.flatMap(allItems).map((item) => [item.id, item]));
}

/** The picked items results still list: Go no longer knows the others. */
export function pickedItems(picks: Picks, listed: ReadonlyMap<string, SpaceItem>): SpaceItem[] {
  return [...picks].flatMap((id) => listed.get(id) ?? []);
}

/** The apps that lock item: it is or lies in their live data, or holds it, which would move along with it. */
export function lockingApps(item: SpaceItem, locks: readonly LockedItem[]): string[] {
  return locks.filter(({ path }) => isAtOrInside(path, item.path) || isInside(item.path, path)).map(({ app }) => app);
}

/**
 * What a run takes of picked: nothing an app locks, and a folder without what
 * it holds, which a pick made while the folder was locked can add. A locked
 * pick stays out of it, so what it holds can be picked on its own meanwhile.
 */
export function movablePicks(picked: readonly SpaceItem[], locks: readonly LockedItem[]): SpaceItem[] {
  const free = picked.filter((item) => lockingApps(item, locks).length === 0);
  return free.filter((item) => !free.some(({ path }) => isInside(path, item.path)));
}

/** A row's checkbox: as a junk group's, or "covered" while a picked folder above holds the item. */
export type PickState = GroupState | "covered";

export function pickState(item: SpaceItem, picked: readonly SpaceItem[]): PickState {
  if (picked.some(({ path }) => isInside(path, item.path))) return "covered";
  if (picked.some(({ id }) => id === item.id)) return "all";
  return picked.some(({ path }) => isInside(item.path, path)) ? "some" : "none";
}

/** Picks item or lets it go. A picked folder takes over what was picked inside it, so no bytes count twice. */
export function setPicked(picks: Picks, item: SpaceItem, on: boolean, listed: ReadonlyMap<string, SpaceItem>): Picks {
  const others = [...picks].filter((id) => id !== item.id);
  if (!on) return new Set(others);
  const inside = new Set(pickedItems(picks, listed).filter(({ path }) => isInside(item.path, path)));
  const covered = new Set([...inside].map(({ id }) => id));
  return new Set([...others.filter((id) => !covered.has(id)), item.id]);
}
