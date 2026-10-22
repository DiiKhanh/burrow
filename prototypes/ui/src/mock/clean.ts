// PROTOTYPE mock data: shaped like Burrow's ScanResult (junk groups > junk items).
export type JunkItem = { id: string; path: string; bytes: number; inUse?: boolean };
export type JunkGroup = {
  id: string;
  name: string;
  description: string;
  recommended: boolean; // selected by default
  lockedReason?: string; // cannot be selected right now
  items: JunkItem[];
};

const GB = 1e9;
const MB = 1e6;

function items(groupId: string, paths: [string, number][]): JunkItem[] {
  return paths.map(([path, bytes], i) => ({ id: `${groupId}-${i}`, path, bytes }));
}

export const SCAN_SECTIONS = [
  "System",
  "User essentials",
  "App caches",
  "Browsers",
  "Cloud & Office",
  "Developer tools",
  "Apps & utilities",
  "App leftovers",
  "Device backups & firmware",
  "Trash",
];

export const JUNK_GROUPS: JunkGroup[] = [
  {
    id: "app-caches",
    name: "App Caches",
    description: "Temporary files apps rebuild on next launch.",
    recommended: true,
    items: items("app-caches", [
      ["~/Library/Caches/com.spotify.client", 2.41 * GB],
      ["~/Library/Caches/com.tinyspeck.slackmacgap", 1.12 * GB],
      ["~/Library/Caches/com.figma.Desktop", 860 * MB],
      ["~/Library/Caches/com.apple.QuickLook.thumbnailcache", 412 * MB],
      ["~/Library/Caches/com.microsoft.VSCode.ShipIt", 388 * MB],
      ["~/Library/Caches/com.hnc.Discord", 341 * MB],
      ["~/Library/Caches/us.zoom.xos", 209 * MB],
      ["~/Library/Caches/com.raycast.macos", 96 * MB],
    ]),
  },
  {
    id: "developer",
    name: "Developer Tools",
    description: "Xcode, SwiftPM and node caches. The next build will be slower.",
    recommended: false,
    items: items("developer", [
      ["~/Library/Developer/Xcode/DerivedData", 9.82 * GB],
      ["~/Library/Developer/CoreSimulator/Caches", 3.4 * GB],
      ["~/.npm/_cacache", 2.07 * GB],
      ["~/Library/Caches/go-build", 1.31 * GB],
      ["~/.bun/install/cache", 612 * MB],
      ["~/Library/Caches/pip", 344 * MB],
    ]),
  },
  {
    id: "browsers",
    name: "Browsers",
    description: "Browser caches. Sites may load slower the first time.",
    recommended: true,
    lockedReason: "Google Chrome is open",
    items: items("browsers", [
      ["~/Library/Caches/Google/Chrome/Default/Cache", 1.62 * GB],
      ["~/Library/Caches/com.apple.Safari", 498 * MB],
      ["~/Library/Caches/Firefox/Profiles", 377 * MB],
    ]),
  },
  {
    id: "user",
    name: "Logs & Saved State",
    description: "Old logs and window restore data.",
    recommended: true,
    items: items("user", [
      ["~/Library/Logs", 1.21 * GB],
      ["~/Library/Saved Application State", 318 * MB],
      ["~/Library/Logs/DiagnosticReports", 142 * MB],
    ]),
  },
  {
    id: "leftovers",
    name: "App Leftovers",
    description: "Files left behind by apps you already removed.",
    recommended: true,
    items: items("leftovers", [
      ["~/Library/Application Support/Notion", 612 * MB],
      ["~/Library/Containers/com.adobe.acc.AdobeCreativeCloud", 288 * MB],
      ["~/Library/Preferences/com.docker.docker.plist", 0.2 * MB],
    ]),
  },
  {
    id: "backups",
    name: "Device Backups & Firmware",
    description: "Old iPhone backups and firmware files. Review before removing.",
    recommended: false,
    items: items("backups", [
      ["~/Library/Application Support/MobileSync/Backup/00008110-001A", 5.84 * GB],
      ["~/Library/iTunes/iPhone Software Updates/iPhone15,2_18.1.ipsw", 7.12 * GB],
    ]),
  },
  {
    id: "trash",
    name: "Trash",
    description: "Empties your Trash for good.",
    recommended: true,
    items: items("trash", [["~/.Trash", 4.21 * GB]]),
  },
];

// One item the cleaner will skip, to show the "skipped" state.
JUNK_GROUPS[0].items[2].inUse = true;

export const groupBytes = (g: JunkGroup) => g.items.reduce((sum, i) => sum + i.bytes, 0);
export const ALL_ITEMS = JUNK_GROUPS.flatMap((g) => g.items);
export const TOTAL_BYTES = ALL_ITEMS.reduce((sum, i) => sum + i.bytes, 0);
