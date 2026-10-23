// Scan results for `vite --mode fake`, shaped like the ones Go sends: every
// junk group of a well-used Mac, in the engine's group order.
import type { JunkGroup, JunkGroupID, RemovalMethod, ScanResult } from "../mygo";

const GB = 1e9;
const MB = 1e6;
const HOME = "/Users/test";

function group(
  id: JunkGroupID,
  removalMethod: RemovalMethod,
  defaultSelected: boolean,
  items: readonly [string, number][],
): JunkGroup {
  return {
    id,
    removalMethod,
    defaultSelected,
    items: items.map(([path, bytes], index) => ({ id: `${id}-${index}`, path: `${HOME}/${path}`, bytes })),
  };
}

/** Every junk group, as a full Review shows them. */
export const fullScan: ScanResult = {
  groups: [
    group("app-caches", "delete", true, [
      ["Library/Caches/com.spotify.client", 2.41 * GB],
      ["Library/Caches/com.tinyspeck.slackmacgap", 1.12 * GB],
      ["Library/Caches/com.figma.Desktop", 860 * MB],
      ["Library/Caches/com.apple.QuickLook.thumbnailcache", 412 * MB],
      ["Library/Caches/com.microsoft.VSCode.ShipIt", 388 * MB],
    ]),
    group("browsers", "delete", true, [
      ["Library/Caches/Google/Chrome/Default/Cache", 1.62 * GB],
      ["Library/Caches/com.apple.Safari", 498 * MB],
      ["Library/Caches/Firefox/Profiles", 377 * MB],
    ]),
    group("logs-saved-state", "delete", true, [
      ["Library/Logs", 1.21 * GB],
      ["Library/Saved Application State", 318 * MB],
    ]),
    group("trash", "delete", true, [[".Trash", 4.21 * GB]]),
    group("developer-tools", "delete", false, [
      ["Library/Developer/Xcode/DerivedData", 9.82 * GB],
      ["Library/Developer/CoreSimulator/Caches", 3.4 * GB],
      [".npm/_cacache", 2.07 * GB],
    ]),
    group("virtualization", "move-to-trash", false, [["Library/Containers/com.docker.docker/Data/vms", 6.3 * GB]]),
    group("app-leftovers", "move-to-trash", true, [
      ["Library/Application Support/Notion", 612 * MB],
      ["Library/Containers/com.adobe.acc.AdobeCreativeCloud", 288 * MB],
    ]),
    group("device-firmware", "move-to-trash", false, [
      ["Library/iTunes/iPhone Software Updates/iPhone15,2_18.1.ipsw", 7.12 * GB],
    ]),
  ],
  unreadable: [],
  locked: [],
};

/** A path deep enough to overflow any row. */
export const LONG_PATH = `${HOME}/Library/Caches/${"com.example.very-long-bundle-identifier/".repeat(6)}Cache.db`;

/** One group with many items, one of them very long, to stress scrolling and truncation. */
export const longScan: ScanResult = {
  groups: [
    group("app-caches", "delete", true, [
      ...Array.from({ length: 120 }, (_, index): [string, number] => [
        `Library/Caches/com.example.app${index}`,
        (index + 1) * MB,
      ]),
      [LONG_PATH.slice(HOME.length + 1), 42 * MB],
    ]),
    ...fullScan.groups.slice(1),
  ],
  unreadable: [],
  locked: [],
};

/** A Scan without Full Disk Access: macOS kept it out of Trash. */
export const unreadableScan: ScanResult = {
  groups: fullScan.groups.filter((junk) => junk.id !== "trash"),
  unreadable: ["trash"],
  locked: [],
};
