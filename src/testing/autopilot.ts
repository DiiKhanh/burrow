// Settles the fake client's calls by the page's URL scenario, so Playwright
// gets whole Scan and Clean runs without driving each step. Only
// `vite --mode fake` installs it; Vitest drives `fakeGo` itself.
import type { CleanProgress, CleanReport, ScanProgress, ScanResult } from "../mygo";
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
async function runScan(call: ScanCall, scenario: string | null) {
  const stuck = STUCK_SCANS[scenario ?? ""];
  if (!(await stillRunning(call, 20))) return;
  call.emit(stuck ?? FINISHED_SCAN_PROGRESS);
  if (stuck || !(await stillRunning(call, 30))) return;
  call.resolve(scanFor(scenario));
}

/**
 * Cleans the selected items of the page's Scan, one every 20 ms. Like the
 * engine until Move to Trash lands, it refuses a selection with items of a
 * Move to Trash group. By `?clean=`: `skipped` skips the first item as in
 * use, `running` stops after the first item and never ends.
 */
async function runClean(call: CleanCall, scan: ScanResult, scenario: string | null) {
  const selected = new Set(call.ids);
  const groups = scan.groups
    .map((group) => ({ ...group, items: group.items.filter((item) => selected.has(item.id)) }))
    .filter((group) => group.items.length > 0);
  if (groups.some((group) => group.removalMethod !== "delete")) {
    call.reject(new Error("clean: Move to Trash is not available yet"));
    return;
  }
  const steps = groups.flatMap((group) => group.items.map((item, index) => ({ group, item, index })));
  let report: CleanReport = { items: [], freedBytes: 0 };
  let progress: CleanProgress | null = null;
  for (const { group, item, index } of steps) {
    if (!(await stillRunning(call, 20))) return;
    const skipReason = scenario === "skipped" && report.items.length === 0 ? "in_use" : null;
    const freedBytes = report.freedBytes + (skipReason ? 0 : item.bytes);
    report = {
      items: [
        ...report.items,
        { id: item.id, path: item.path, bytes: item.bytes, method: group.removalMethod, skipReason },
      ],
      freedBytes,
    };
    const before: Pick<CleanProgress, "cleaned" | "skipped"> =
      index === 0 || !progress ? { cleaned: 0, skipped: 0 } : progress;
    progress = {
      groupId: group.id,
      selected: group.items.length,
      cleaned: before.cleaned + (skipReason ? 0 : 1),
      skipped: before.skipped + (skipReason ? 1 : 0),
      freedBytes,
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
 * Security, `refused` nothing.
 */
export function installAutopilot(go: FakeGo, search: string) {
  const scenarios = new URLSearchParams(search);
  const scan = scenarios.get("scan");
  go.scan.onCall((call) => void runScan(call, scan));
  go.clean.onCall((call) => void runClean(call, scanFor(scan), scenarios.get("clean")));
  go.privacy.onCall((call) => {
    const settings = scenarios.get("settings");
    if (settings === "refused") call.reject(new Error("System Settings did not open"));
    else call.resolve(settings === "fallback" ? "privacy-security" : "full-disk-access");
  });
}
