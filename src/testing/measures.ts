// Measure results for `vite --mode fake`, shaped like the ones Go sends:
// the overview of a well-used Mac and a few folders in Home, each list
// largest first.
import type { BlockReason, MeasureResult, MeasureTarget, SpaceItem, Tag } from "../mygo";
import { allItems } from "../space/results";

const GB = 1e9;
const MB = 1e6;
const HOME = "/Users/test";

/** How a target narrows its folder, as Go sets it on Home and Old Downloads. */
type Narrowing = Pick<MeasureTarget, "excludeLibrary" | "olderThanDays">;

const WITHOUT_LIBRARY: Narrowing = { excludeLibrary: true };
const OLD: Narrowing = { olderThanDays: 90 };

function item(name: string, path: string, bytes: number, tags: Tag[] = [], narrowing: Narrowing = {}): SpaceItem {
  return {
    id: `id:${path}`,
    name,
    path,
    bytes,
    isDir: true,
    readState: "complete",
    tags,
    blocked: null,
    opens: { kind: "folder", path, ...narrowing },
  };
}

function file(name: string, path: string, bytes: number, tags: Tag[] = []): SpaceItem {
  return { id: `id:${path}`, name, path, bytes, isDir: false, readState: "complete", tags, blocked: null, opens: null };
}

function blocked(reason: BlockReason, spaceItem: SpaceItem): SpaceItem {
  return { ...spaceItem, blocked: reason };
}

const topLevel = (spaceItem: SpaceItem) => blocked("top-level", spaceItem);
const outsideHome = (spaceItem: SpaceItem) => blocked("outside-home", spaceItem);
const cleanHandles = (spaceItem: SpaceItem) => blocked("clean-handles", spaceItem);

/** A folder Mole could read only part of: its size may be low. */
function partly(name: string, path: string, bytes: number): SpaceItem {
  return { ...item(name, path, bytes), readState: "partial" };
}

/** A folder Mole could not read: no size, and nothing to open. */
function unreadable(name: string, path: string, tags: Tag[] = []): SpaceItem {
  return { ...item(name, path, 0, tags), readState: "unavailable", opens: null };
}

/** The same in the overview's row and inside it, as is OLD_DOWNLOADS_BYTES. */
const HOME_BYTES = 46_300_012_000;
const OLD_DOWNLOADS_BYTES = 3.02 * GB;

const locations = [
  topLevel(item("User Library", `${HOME}/Library`, 73.1 * GB)),
  topLevel(item("Home", HOME, HOME_BYTES, [], WITHOUT_LIBRARY)),
  outsideHome(item("Applications", "/Applications", 19.7 * GB)),
  outsideHome(item("System Library", "/Library", 6.83 * GB)),
];

/** The overview: Insights lie inside the locations, so only these add up. */
export const overview: MeasureResult = {
  target: { kind: "overview" },
  measuredAt: "2026-10-30T09:00:00Z",
  items: locations,
  insights: [
    item("Docker Data", `${HOME}/Library/Containers/com.docker.docker/Data`, 21.6 * GB, ["insight"]),
    item("Xcode Simulators", `${HOME}/Library/Developer/CoreSimulator/Devices`, 3.07 * GB, ["insight"]),
    topLevel(item("Old Downloads (90d+)", `${HOME}/Downloads`, OLD_DOWNLOADS_BYTES, ["insight"], OLD)),
    cleanHandles(item("Homebrew Cache", `${HOME}/Library/Caches/Homebrew`, 181 * MB, ["insight", "clean-handles"])),
    cleanHandles(item("System Logs", `${HOME}/Library/Logs`, 2.1 * MB, ["insight", "clean-handles"])),
  ],
  totalBytes: 145_930_012_000,
};

/** An overview Mole could not read all of: one location read in part, one Insight not at all. */
export const unreadableOverview: MeasureResult = {
  ...overview,
  items: locations.map((location) =>
    location.name === "User Library" ? topLevel(partly(location.name, location.path, location.bytes)) : location,
  ),
  insights: [
    ...overview.insights,
    unreadable("iOS Backups", `${HOME}/Library/Application Support/MobileSync/Backup`, ["insight"]),
  ],
};

function folder(
  path: string,
  items: SpaceItem[],
  totalBytes: number,
  largestFiles: SpaceItem[] = [],
  narrowing: Narrowing = {},
): MeasureResult {
  return {
    target: { kind: "folder", path, ...narrowing },
    measuredAt: "2026-10-30T09:01:00Z",
    items,
    insights: [],
    largestFiles,
    totalBytes,
  };
}

/** Home as the overview opens it, without ~/Library, holding more folders and a file. */
export const homeFolder = folder(
  HOME,
  [
    topLevel(item("Projects", `${HOME}/Projects`, 21.4 * GB)),
    topLevel(item("Movies", `${HOME}/Movies`, 12.8 * GB)),
    topLevel(item("Downloads", `${HOME}/Downloads`, 7.6 * GB)),
    topLevel(item("Documents", `${HOME}/Documents`, 4.5 * GB)),
    topLevel(file("notes.txt", `${HOME}/notes.txt`, 12 * 1e3)),
  ],
  HOME_BYTES,
  [
    file("Trip 2025.mov", `${HOME}/Movies/Trip 2025.mov`, 8.2 * GB),
    file(`quote"and'apostrophe.zip`, `${HOME}/Projects/quote"and'apostrophe.zip`, 3.1 * GB),
    file("Burrow.dmg", `${HOME}/Projects/burrow/release/Burrow.dmg`, 1.2 * GB),
  ],
  WITHOUT_LIBRARY,
);

const DOWNLOADS = `${HOME}/Downloads`;

/** What Old Downloads lists: the part of Downloads the Insight counts. */
const oldDownloads = [
  file("Xcode_16.xip", `${DOWNLOADS}/Xcode_16.xip`, 2.1 * GB),
  item("Installers", `${DOWNLOADS}/Installers`, 900 * MB),
  file("invoice.pdf", `${DOWNLOADS}/invoice.pdf`, 20 * MB),
];

/** Downloads as the Old Downloads Insight opens it. */
export const oldDownloadsFolder = folder(
  DOWNLOADS,
  oldDownloads,
  OLD_DOWNLOADS_BYTES,
  [file("Xcode_16.xip", `${DOWNLOADS}/Xcode_16.xip`, 2.1 * GB)],
  OLD,
);

/** Downloads as Home opens it, in full. */
export const downloadsFolder = folder(
  DOWNLOADS,
  [file("macOS.ipsw", `${DOWNLOADS}/macOS.ipsw`, 4.58 * GB), ...oldDownloads],
  7.6 * GB,
);

/** Projects in Home, with names that need care. */
export const projectsFolder = folder(
  `${HOME}/Projects`,
  [
    item("burrow", `${HOME}/Projects/burrow`, 12.1 * GB),
    item("Ảnh chụp", `${HOME}/Projects/Ảnh chụp`, 6.2 * GB),
    file(`quote"and'apostrophe.zip`, `${HOME}/Projects/quote"and'apostrophe.zip`, 3.1 * GB),
  ],
  21.4 * GB,
  [
    file(`quote"and'apostrophe.zip`, `${HOME}/Projects/quote"and'apostrophe.zip`, 3.1 * GB),
    file("Burrow.dmg", `${HOME}/Projects/burrow/release/Burrow.dmg`, 1.2 * GB),
  ],
);

/** One project, with folders its tools make again. */
export const burrowFolder = folder(
  `${HOME}/Projects/burrow`,
  [
    item("node_modules", `${HOME}/Projects/burrow/node_modules`, 6.4 * GB, ["regenerable"]),
    item("dist", `${HOME}/Projects/burrow/dist`, 3.3 * GB, ["regenerable"]),
    item("release", `${HOME}/Projects/burrow/release`, 1.2 * GB),
    item("src", `${HOME}/Projects/burrow/src`, 1.2 * GB),
  ],
  12.1 * GB,
  [file("Burrow.dmg", `${HOME}/Projects/burrow/release/Burrow.dmg`, 1.2 * GB)],
);

/** The User Library, with one folder read in part and one not at all. */
export const libraryFolder = folder(
  `${HOME}/Library`,
  [
    partly("Application Support", `${HOME}/Library/Application Support`, 41.2 * GB),
    item("Developer", `${HOME}/Library/Developer`, 25.1 * GB),
    unreadable("Mail", `${HOME}/Library/Mail`),
  ],
  66.3 * GB,
);

/** A folder read in part, with nothing Mole could not read at all. */
export const partlyReadFolder = folder(
  "/Library",
  [
    outsideHome(partly("Application Support", "/Library/Application Support", 4.1 * GB)),
    outsideHome(item("Fonts", "/Library/Fonts", 2.7 * GB)),
  ],
  6.8 * GB,
);

const KNOWN_FOLDERS = [
  homeFolder,
  oldDownloadsFolder,
  downloadsFolder,
  projectsFolder,
  burrowFolder,
  libraryFolder,
  partlyReadFolder,
];

/** Every Space item of the fake Mac by id, for the fake Move to Trash. */
export function fakeItems(): ReadonlyMap<string, SpaceItem> {
  const results = [overview, unreadableOverview, ...KNOWN_FOLDERS];
  return new Map(results.flatMap(allItems).map((spaceItem) => [spaceItem.id, spaceItem]));
}

/** The fake Measure of target: one of the folders above, or else nothing. */
export function folderAt(target: MeasureTarget): MeasureResult {
  const known = KNOWN_FOLDERS.find((result) => JSON.stringify(result.target) === JSON.stringify(target));
  return known ?? { ...folder(target.path ?? "", [], 0), target };
}
