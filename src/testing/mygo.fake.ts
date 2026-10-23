// The scripted stand-in for the generated client in src/mygo.ts, used by
// Vitest and by `vite --mode fake` for Playwright. `satisfies` keeps its
// shape in step with the Go services.
import type * as Real from "../mygo";

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
      later(50, () =>
        resolve({
          groups: [
            {
              id: "app-caches",
              removalMethod: "delete",
              defaultSelected: true,
              items: [{ id: "cache", path: "/Users/test/Library/Caches/Burrow", bytes: 1_200_000_000 }],
            },
            {
              id: "device-firmware",
              removalMethod: "move-to-trash",
              defaultSelected: false,
              items: [{ id: "firmware", path: "/Users/test/Library/iTunes/Burrow.ipsw", bytes: 7_000_000_000 }],
            },
          ],
        }),
      );
    });
  },
} as const satisfies typeof Real.Clean;

export const Status = {
  ping: async () => {},
} as const satisfies typeof Real.Status;
