// Measure results for `vite --mode fake`, shaped like the ones Go sends:
// the overview of a well-used Mac and a few folders in Home, each list
// largest first.
import type { MeasureResult, SpaceItem, Tag } from "../mygo";

const GB = 1e9;
const MB = 1e6;
const HOME = "/Users/test";

function item(name: string, path: string, bytes: number, tags: Tag[] = []): SpaceItem {
  return {
    id: `id:${path}`,
    name,
    path,
    bytes,
    isDir: true,
    readState: "complete",
    tags,
    opens: { kind: "folder", path },
  };
}

function file(name: string, path: string, bytes: number, tags: Tag[] = []): SpaceItem {
  return { id: `id:${path}`, name, path, bytes, isDir: false, readState: "complete", tags, opens: null };
}

/** A folder Mole could read only part of: its size may be low. */
function partly(name: string, path: string, bytes: number): SpaceItem {
  return { ...item(name, path, bytes), readState: "partial" };
}

/** A folder Mole could not read: no size, and nothing to open. */
function unreadable(name: string, path: string, tags: Tag[] = []): SpaceItem {
  return { ...item(name, path, 0, tags), readState: "unavailable", opens: null };
}

const locations = [
  item("User Library", `${HOME}/Library`, 73.1 * GB),
  item("Home", HOME, 46.4 * GB),
  item("Applications", "/Applications", 19.7 * GB),
  item("System Library", "/Library", 6.83 * GB),
];

/** The overview: Insights lie inside the locations, so only these add up. */
export const overview: MeasureResult = {
  target: { kind: "overview" },
  measuredAt: "2026-10-30T09:00:00Z",
  items: locations,
  insights: [
    item("Docker Data", `${HOME}/Library/Containers/com.docker.docker/Data`, 21.6 * GB, ["insight"]),
    item("Xcode Simulators", `${HOME}/Library/Developer/CoreSimulator/Devices`, 3.07 * GB, ["insight"]),
    item("Old Downloads (90d+)", `${HOME}/Downloads`, 3.02 * GB, ["insight"]),
    item("Homebrew Cache", `${HOME}/Library/Caches/Homebrew`, 181 * MB, ["insight", "clean-handles"]),
    item("System Logs", `${HOME}/Library/Logs`, 2.1 * MB, ["insight", "clean-handles"]),
  ],
  totalBytes: 146.03 * GB,
};

/** An overview Mole could not read all of: one location read in part, one Insight not at all. */
export const unreadableOverview: MeasureResult = {
  ...overview,
  items: locations.map((location) =>
    location.name === "User Library" ? partly(location.name, location.path, location.bytes) : location,
  ),
  insights: [
    ...overview.insights,
    unreadable("iOS Backups", `${HOME}/Library/Application Support/MobileSync/Backup`, ["insight"]),
  ],
};

function folder(path: string, items: SpaceItem[], totalBytes: number, largestFiles: SpaceItem[] = []): MeasureResult {
  return {
    target: { kind: "folder", path },
    measuredAt: "2026-10-30T09:01:00Z",
    items,
    insights: [],
    largestFiles,
    totalBytes,
  };
}

/** Home as the overview opens it, holding more folders and a file. */
export const homeFolder = folder(
  HOME,
  [
    item("Projects", `${HOME}/Projects`, 21.4 * GB),
    item("Movies", `${HOME}/Movies`, 12.8 * GB),
    item("Downloads", `${HOME}/Downloads`, 7.6 * GB),
    item("Documents", `${HOME}/Documents`, 4.5 * GB),
    file("notes.txt", `${HOME}/notes.txt`, 12 * 1e3),
  ],
  46_300_012_000,
  [
    file("Trip 2025.mov", `${HOME}/Movies/Trip 2025.mov`, 8.2 * GB),
    file(`quote"and'apostrophe.zip`, `${HOME}/Projects/quote"and'apostrophe.zip`, 3.1 * GB),
    file("Burrow.dmg", `${HOME}/Projects/burrow/release/Burrow.dmg`, 1.2 * GB),
  ],
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
  [partly("Application Support", "/Library/Application Support", 4.1 * GB), item("Fonts", "/Library/Fonts", 2.7 * GB)],
  6.8 * GB,
);

/** The fake Measure of the folder at path: Home, Projects, burrow and the Libraries, or else nothing. */
export function folderAt(path: string): MeasureResult {
  const known = [homeFolder, projectsFolder, burrowFolder, libraryFolder, partlyReadFolder];
  return known.find((measured) => measured.target.path === path) ?? folder(path, [], 0);
}
