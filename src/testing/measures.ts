// Measure results for `vite --mode fake`, shaped like the ones Go sends:
// the overview of a well-used Mac, each list largest first.
import type { MeasureResult, SpaceItem } from "../mygo";

const GB = 1e9;
const MB = 1e6;
const HOME = "/Users/test";

function item(name: string, path: string, bytes: number): SpaceItem {
  return { id: `id:${path}`, name, path, bytes, isDir: true };
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
