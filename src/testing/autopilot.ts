// Settles the fake client's calls by the page's URL scenario, so Playwright
// gets whole Scan and Clean runs without driving each step. Only
// `vite --mode fake` installs it; Vitest drives `fakeGo` itself.
import type { CleanProgress, CleanReport, LockedGroup, ScanProgress, ScanResult } from "../mygo";
import type { CleanCall, FakeGo, ScanCall } from "./mygo.fake";
import { fullScan, longScan, unreadableScan } from "./scans";

/** Scan results by the page's `?scan=` scenario; any other value gets fullScan. */
const SCANS: Record<string, ScanResult> = { long: longScan, unreadable: unreadableScan };

/** Progress the `?scan=running` and `?scan=indeterminate` Scans stop at. */
const STUCK_SCANS: Record<string, ScanProgress> = {
  running: {
    groupId: "app-caches",
    groupBytes: 400_000,
    foundBytes: 1_500_000,
    currentPath: "/Users/test/Library/Caches/Burrow",
    fraction: 0.35,
  },
  indeterminate: {
    groupId: "browsers",
    groupBytes: 0,
    foundBytes: 1_500_000,
    currentPath: "/Users/test/Library/Caches/Browser",
    fraction: null,
  },
};

const FINISHED_SCAN_PROGRESS: ScanProgress = {
  groupId: "app-caches",
  groupBytes: 1_200_000_000,
  foundBytes: 1_200_000_000,
  currentPath: "/Users/test/Library/Caches/Burrow",
  fraction: 1,
};

/** The browsers open on the fake Mac, from `?browsers=Safari,Arc`; Playwright quits them. */
type Browsers = { open: readonly string[] };

/** The junk groups the open browsers lock, as the engine reports them. */
function lockedBy(browsers: Browsers): LockedGroup[] {
  return browsers.open.length > 0 ? [{ id: "browsers", apps: [...browsers.open] }] : [];
}

/** Waits ms, then reports whether the call is still running; a cancelled one ends as Go ends it. */
async function stillRunning(call: ScanCall | CleanCall, ms: number): Promise<boolean> {
  await new Promise((done) => setTimeout(done, ms));
  if (call.cancelled) call.reject(new Error("fake: cancelled"));
  return !call.cancelled;
}

/**
 * Runs a Scan by `?scan=`: `running` and `indeterminate` stop at their
 * progress and never end; `long`, `unreadable` and any other value end with
 * their ScanResult.
 */
async function runScan(call: ScanCall, scenario: string | null, browsers: Browsers) {
  const stuck = STUCK_SCANS[scenario ?? ""];
  if (!(await stillRunning(call, 20))) return;
  call.emit(stuck ?? FINISHED_SCAN_PROGRESS);
  if (stuck || !(await stillRunning(call, 30))) return;
  call.resolve({ ...scanFor(scenario), locked: lockedBy(browsers) });
}

/**
 * Cleans the selected items of the page's Scan, one every 20 ms, counting a
 * Move to Trash group's items as moved to Trash, not freed. Like the engine,
 * it skips the items of a locked group as in use. By `?clean=`: `skipped`
 * skips the first item as in use, `running` stops after the first item and
 * never ends, `failed` fails before removing anything.
 */
async function runClean(call: CleanCall, scan: ScanResult, scenario: string | null, browsers: Browsers) {
  if (scenario === "failed") {
    call.reject(new Error("fake: Clean failed"));
    return;
  }
  const selected = new Set(call.ids);
  const groups = scan.groups
    .map((group) => ({ ...group, items: group.items.filter((item) => selected.has(item.id)) }))
    .filter((group) => group.items.length > 0);
  const steps = groups.flatMap((group) => group.items.map((item, index) => ({ group, item, index })));
  let report: CleanReport = { items: [], freedBytes: 0, trashedBytes: 0 };
  let progress: CleanProgress | null = null;
  for (const { group, item, index } of steps) {
    if (!(await stillRunning(call, 20))) return;
    const locked = lockedBy(browsers).some((lock) => lock.id === group.id);
    const skipReason = locked || (scenario === "skipped" && report.items.length === 0) ? "in_use" : null;
    const removed = skipReason ? 0 : item.bytes;
    const trashed = group.removalMethod === "move-to-trash";
    const freedBytes = report.freedBytes + (trashed ? 0 : removed);
    const trashedBytes = report.trashedBytes + (trashed ? removed : 0);
    report = {
      items: [
        ...report.items,
        { id: item.id, path: item.path, bytes: item.bytes, method: group.removalMethod, skipReason },
      ],
      freedBytes,
      trashedBytes,
    };
    const before: Pick<CleanProgress, "cleaned" | "skipped"> =
      index === 0 || !progress ? { cleaned: 0, skipped: 0 } : progress;
    progress = {
      groupId: group.id,
      selected: group.items.length,
      cleaned: before.cleaned + (skipReason ? 0 : 1),
      skipped: before.skipped + (skipReason ? 1 : 0),
      freedBytes,
      trashedBytes,
    };
    call.emit(progress);
    if (scenario === "running") return;
  }
  call.resolve(report);
}

function scanFor(scenario: string | null): ScanResult {
  return SCANS[scenario ?? ""] ?? fullScan;
}

/**
 * Settles every call by the scenarios in search, e.g. `?scan=unreadable&settings=fallback`.
 * `?settings=` picks what System Settings opens: `fallback` only Privacy &
 * Security, `refused` nothing. `?browsers=` lists the open browsers, which
 * Playwright quits through `window.burrowBrowsers`.
 */
export function installAutopilot(go: FakeGo, search: string) {
  const scenarios = new URLSearchParams(search);
  const scan = scenarios.get("scan");
  const browsers: Browsers = { open: scenarios.get("browsers")?.split(",") ?? [] };
  window.burrowBrowsers = {
    quit: (app) => {
      browsers.open = browsers.open.filter((open) => open !== app);
    },
  };
  go.scan.onCall((call) => void runScan(call, scan, browsers));
  go.clean.onCall((call) => void runClean(call, scanFor(scan), scenarios.get("clean"), browsers));
  go.locked.onCall((call) => call.resolve(lockedBy(browsers)));
  go.privacy.onCall((call) => {
    const settings = scenarios.get("settings");
    if (settings === "refused") call.reject(new Error("System Settings did not open"));
    else call.resolve(settings === "fallback" ? "privacy-security" : "full-disk-access");
  });
}

declare global {
  interface Window {
    /** Quits a browser open on the fake Mac. */
    burrowBrowsers?: { quit(app: string): void };
  }
}
