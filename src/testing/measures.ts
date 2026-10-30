// Measure results for `vite --mode fake`, shaped like the ones Go sends:
// the overview of a well-used Mac and a few folders in Home, each list
// largest first.
import type { MeasureResult, SpaceItem } from "../mygo";

const GB = 1e9;
const MB = 1e6;
const HOME = "/Users/test";

function item(name: string, path: string, bytes: number): SpaceItem {
  return { id: `id:${path}`, name, path, bytes, isDir: true, opens: { kind: "folder", path } };
}

function file(name: string, path: string, bytes: number): SpaceItem {
  return { id: `id:${path}`, name, path, bytes, isDir: false, opens: null };
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
    item("Docker Data", `${HOME}/Library/Containers/com.docker.docker/Data`, 21.6 * GB),
    item("Xcode Simulators", `${HOME}/Library/Developer/CoreSimulator/Devices`, 3.07 * GB),
    item("Old Downloads (90d+)", `${HOME}/Downloads`, 3.02 * GB),
    item("Homebrew Cache", `${HOME}/Library/Caches/Homebrew`, 181 * MB),
    item("System Logs", `${HOME}/Library/Logs`, 2.1 * MB),
  ],
  totalBytes: 146.03 * GB,
};

function folder(path: string, items: SpaceItem[], totalBytes: number): MeasureResult {
  return { target: { kind: "folder", path }, measuredAt: "2026-10-30T09:01:00Z", items, insights: [], totalBytes };
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
);

/** The fake Measure of the folder at path: Home and Projects, or else nothing. */
export function folderAt(path: string): MeasureResult {
  return [homeFolder, projectsFolder].find((known) => known.target.path === path) ?? folder(path, [], 0);
}
