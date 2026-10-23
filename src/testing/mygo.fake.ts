// The scripted stand-in for the generated client in src/mygo.ts, used by
// Vitest and by `vite --mode fake` for Playwright. `satisfies` keeps its
// shape in step with the Go services.
import type { GoEvent } from "mygo-runtime";
import type * as Real from "../mygo";
import { fullScan, longScan, unreadableScan } from "./scans";

/** Scan results by the page's `?scan=` scenario; any other value gets fullScan. */
const SCANS: Record<string, Real.ScanResult> = { long: longScan, unreadable: unreadableScan };

/** The page's `?<name>=` scenario. */
function scenario(name: string): string | null {
  return new URLSearchParams(location.search).get(name);
}

/** The ScanResult the page's `?scan=` scenario resolves to. */
function scanFor(name: string | null): Real.ScanResult {
  return SCANS[name ?? ""] ?? fullScan;
}

export const Clean = {
  /**
   * Cleans the selected items of the page's scan, one every 20 ms. Like the
   * engine until Move to Trash lands, it refuses a selection with items of a
   * Move to Trash group. Scenarios by `?clean=`: `skipped` skips the first
   * item as in use, `running` stops after the first item and never ends.
   */
  clean: async (ids: string[], updates: Parameters<typeof Real.Clean.clean>[1]): Promise<Real.CleanReport> => {
    if (!("close" in updates)) return { items: [], freedBytes: 0 };
    const mode = scenario("clean");
    const selected = new Set(ids);
    const groups = scanFor(scenario("scan"))
      .groups.map((group) => ({ ...group, items: group.items.filter((item) => selected.has(item.id)) }))
      .filter((group) => group.items.length > 0);
    if (groups.some((group) => group.removalMethod !== "delete")) {
      throw new Error("clean: Move to Trash is not available yet");
    }
    const steps = groups.flatMap((group) => group.items.map((item, index) => ({ group, item, index })));
    let report: Real.CleanReport = { items: [], freedBytes: 0 };
    let progress: Real.CleanProgress | null = null;
    for (const { group, item, index } of steps) {
      await new Promise((done) => setTimeout(done, 20));
      const skipReason = mode === "skipped" && report.items.length === 0 ? "in_use" : null;
      const freedBytes = report.freedBytes + (skipReason ? 0 : item.bytes);
      report = {
        items: [
          ...report.items,
          { id: item.id, path: item.path, bytes: item.bytes, method: group.removalMethod, skipReason },
        ],
        freedBytes,
      };
      const before: Pick<Real.CleanProgress, "cleaned" | "skipped"> =
        index === 0 || !progress ? { cleaned: 0, skipped: 0 } : progress;
      progress = {
        groupId: group.id,
        selected: group.items.length,
        cleaned: before.cleaned + (skipReason ? 0 : 1),
        skipped: before.skipped + (skipReason ? 1 : 0),
        freedBytes,
      };
      if (!updates.closed) updates.onmessage?.(progress);
      if (mode === "running") return new Promise(() => {});
    }
    return report;
  },
  scan: async (updates: Parameters<typeof Real.Clean.scan>[0]): Promise<Real.ScanResult> => {
    if (!("close" in updates)) return { groups: [], unreadable: [] };
    const scanScenario = scenario("scan");
    return new Promise((resolve, reject) => {
      const timers: ReturnType<typeof setTimeout>[] = [];
      const later = (delay: number, action: () => void) => timers.push(setTimeout(action, delay));
      const emit = (progress: Real.ScanProgress) => {
        if (!updates.closed) updates.onmessage?.(progress);
      };
      updates.onclose = () => {
        timers.forEach(clearTimeout);
        reject(new Error("scan cancelled"));
      };

      if (scanScenario === "running") {
        later(20, () =>
          emit({
            groupId: "app-caches",
            groupBytes: 400_000,
            foundBytes: 1_500_000,
            currentPath: "/Users/test/Library/Caches/Burrow",
            fraction: 0.35,
          }),
        );
        return;
      }
      if (scanScenario === "indeterminate") {
        later(20, () =>
          emit({
            groupId: "browsers",
            groupBytes: 0,
            foundBytes: 1_500_000,
            currentPath: "/Users/test/Library/Caches/Browser",
            fraction: null,
          }),
        );
        return;
      }

      later(20, () =>
        emit({
          groupId: "app-caches",
          groupBytes: 1_200_000_000,
          foundBytes: 1_200_000_000,
          currentPath: "/Users/test/Library/Caches/Burrow",
          fraction: 1,
        }),
      );
      later(50, () => resolve(scanFor(scanScenario)));
    });
  },
} as const satisfies typeof Real.Clean;

/**
 * Which System Settings pane opens, by the page's `?settings=` scenario:
 * `fallback` opens only Privacy & Security, `refused` opens nothing.
 */
export const Privacy = {
  openFullDiskAccess: async (): Promise<Real.SettingsPane> => {
    const settings = scenario("settings");
    if (settings === "refused") throw new Error("System Settings did not open");
    return settings === "fallback" ? "privacy-security" : "full-disk-access";
  },
} as const satisfies typeof Real.Privacy;

export const Status = {
  ping: async () => {},
} as const satisfies typeof Real.Status;

/** An event the test sends in place of Go. */
export type FakeEvent<T> = GoEvent<T> & { emit(payload: T): void };

function fakeEvent<T>(name: string): FakeEvent<T> {
  const listeners = new Set<(payload: T) => void>();
  const on = (listener: (payload: T) => void) => {
    // Wrapped, so subscribing one function twice gives two subscriptions.
    const entry = (payload: T) => listener(payload);
    listeners.add(entry);
    return () => {
      listeners.delete(entry);
    };
  };
  return {
    name,
    on,
    once(listener) {
      const off = on((payload) => {
        off();
        listener(payload);
      });
      return off;
    },
    emit(payload) {
      for (const listener of [...listeners]) listener(payload);
    },
  };
}

export const events = {
  status: fakeEvent<Real.Snapshot>("status"),
} as const satisfies typeof Real.events;

/** What Playwright drives through `window.burrowFake` in `--mode fake`. */
export type FakeGo = { emitStatus(snapshot: Real.Snapshot): void };

declare global {
  interface Window {
    burrowFake?: FakeGo;
  }
}

if (typeof window !== "undefined") {
  window.burrowFake = { emitStatus: (snapshot) => events.status.emit(snapshot) };
}
