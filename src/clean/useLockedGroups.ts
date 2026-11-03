import { Clean, type JunkGroupID, type LockedGroup } from "../mygo";
import { usePolled } from "../shell/usePolled";

/**
 * The apps locking each locked junk group, starting from the Scan's and
 * asked again while mounted, so a group unlocks once its apps quit, without a
 * new Scan.
 */
export function useLockedGroups(initial: readonly LockedGroup[]): ReadonlyMap<JunkGroupID, readonly string[]> {
  const locked = usePolled<readonly LockedGroup[]>(initial, Clean.locked);
  return new Map(locked.map((group) => [group.id, group.apps]));
}
