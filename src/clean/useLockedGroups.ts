import { useEffect, useState } from "react";
import { Clean, type JunkGroupID, type LockedGroup } from "../mygo";

/** How long Review waits between asking which junk groups are locked. */
const POLL_MS = 1_000;

/**
 * The apps locking each locked junk group, starting from the Scan's and
 * asked again every second while mounted, so a group unlocks once its apps
 * quit, without a new Scan.
 */
export function useLockedGroups(initial: readonly LockedGroup[]): ReadonlyMap<JunkGroupID, readonly string[]> {
  const [locked, setLocked] = useState(initial);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      Clean.locked()
        .then(
          (next) => {
            if (mounted) setLocked(next);
          },
          // Go could not tell which apps run: the last answer stands, and the
          // engine still skips a locked group's items as in use.
          () => {},
        )
        .finally(() => {
          if (mounted) timer = setTimeout(poll, POLL_MS);
        });
    };
    poll();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  return new Map(locked.map((group) => [group.id, group.apps]));
}
