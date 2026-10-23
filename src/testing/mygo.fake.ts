// The scripted stand-in for the generated client in src/mygo.ts, used by
// Vitest and by `vite --mode fake` for Playwright. `satisfies` keeps its
// shape in step with the Go services.
import type { GoEvent } from "mygo-runtime";
import type * as Real from "../mygo";
import { fullScan, longScan } from "./scans";

/** Scan results by the page's `?scan=` scenario; any other value gets fullScan. */
const SCANS: Record<string, Real.ScanResult> = { long: longScan };

export const Clean = {
  scan: async (updates: Parameters<typeof Real.Clean.scan>[0]): Promise<Real.ScanResult> => {
    if (!("close" in updates)) return { groups: [] };
    const scenario = new URLSearchParams(location.search).get("scan");
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

      if (scenario === "running") {
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
      if (scenario === "indeterminate") {
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
      later(50, () => resolve(SCANS[scenario ?? ""] ?? fullScan));
    });
  },
} as const satisfies typeof Real.Clean;

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
