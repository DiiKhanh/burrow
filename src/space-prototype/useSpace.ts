// PROTOTYPE (#55), throwaway: all of Space's state in one hook, shared by
// the variants so only their layout differs. Move to Trash is a stub: it
// never touches the disk.
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Entry, isOld, type Measured, type Picked, type Place } from "./model";

type Result =
  | { state: "measuring" }
  | { state: "done"; data: Measured; epoch: number }
  | { state: "error"; message: string };

export type Sim = { measuring: boolean; protected: boolean };

export type TrashReport = { moved: Picked[]; skipped: { item: Picked; reason: string }[] };

const keyOf = (path: string | null) => path ?? "<overview>";

export function useSpace(sim: Sim) {
  const [home, setHome] = useState("");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [stack, setStack] = useState<Place[]>([{ path: null, title: "This Mac" }]);
  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const [trashed, setTrashed] = useState<Record<string, number>>({});
  const [cleanEpoch, setCleanEpoch] = useState(0);
  const [report, setReport] = useState<TrashReport | null>(null);

  useEffect(() => {
    fetch("/__prototype/home")
      .then((r) => r.json())
      .then((j: { home: string }) => setHome(j.home));
  }, []);

  const measure = useCallback(
    (path: string | null, fresh = false) => {
      const key = keyOf(path);
      setResults((r) => ({ ...r, [key]: { state: "measuring" } }));
      const q = new URLSearchParams();
      if (path) q.set("path", path);
      if (fresh) q.set("fresh", "1");
      fetch(`/__prototype/measure?${q}`)
        .then(async (r) => (r.ok ? ((await r.json()) as Measured) : Promise.reject(new Error(await r.text()))))
        .then(
          (data) => setResults((r) => ({ ...r, [key]: { state: "done", data, epoch: cleanEpoch } })),
          (err: Error) => setResults((r) => ({ ...r, [key]: { state: "error", message: err.message } })),
        );
    },
    [cleanEpoch],
  );

  /** A folder's Measure if one ran; never starts one. */
  const resultFor = useCallback((path: string) => results[keyOf(path)], [results]);
  /** Starts a Measure for a folder not measured yet (Rings' outer ring). */
  const prefetch = useCallback(
    (path: string) => {
      if (!results[keyOf(path)]) measure(path);
    },
    [results, measure],
  );

  const place = stack[stack.length - 1] as Place;
  const raw = results[keyOf(place.path)];
  useEffect(() => {
    if (!raw) measure(place.path);
  }, [raw, place.path, measure]);

  /** Size minus whatever was moved to the Trash under it (no re-Measure). */
  const sizeOf = useCallback(
    (path: string, size: number) =>
      Object.entries(trashed).reduce((s, [p, b]) => (p === path || p.startsWith(`${path}/`) ? s - b : s), size),
    [trashed],
  );

  const adjust = useCallback(
    (entries: Entry[]) =>
      entries
        .filter((e) => !(e.path in trashed))
        .map((e) => ({ ...e, size: Math.max(0, sizeOf(e.path, e.size)) }))
        .sort((a, b) => b.size - a.size),
    [trashed, sizeOf],
  );

  const view = useMemo(() => {
    if (sim.measuring || !raw || raw.state === "measuring") return { state: "measuring" as const, place };
    if (raw.state === "error") return { state: "error" as const, place, message: raw.message };
    let entries = adjust(raw.data.entries ?? []);
    if (place.oldOnly) entries = entries.filter((e) => isOld(e));
    if (sim.protected && entries.length > 1) {
      entries = entries.map((e, i) => (i === 1 ? { ...e, scan_status: "unavailable" as const, size: 0 } : e));
    }
    const largeFiles = (raw.data.large_files ?? []).filter((f) => !(f.path in trashed));
    // Insights sit inside the locations (Docker Data is in User Library):
    // only locations add up, or the overview counts the same bytes twice.
    const insights = place.path === null ? entries.filter((e) => e.insight) : [];
    const locations = place.path === null ? entries.filter((e) => !e.insight) : entries;
    const total = locations.reduce((s, e) => s + e.size, 0);
    return {
      state: "done" as const,
      place,
      entries,
      insights,
      locations,
      largeFiles,
      total,
      scanStatus: raw.data.scan_status,
      stale: raw.epoch < cleanEpoch,
    };
  }, [raw, place, sim, adjust, trashed, cleanEpoch]);

  const open = useCallback((entry: Entry) => {
    if (!entry.is_dir) return;
    const oldOnly = entry.insight && entry.name.startsWith("Old Downloads");
    setStack((s) => [...s, { path: entry.path, title: entry.name, oldOnly }]);
  }, []);

  const goTo = useCallback((index: number) => setStack((s) => s.slice(0, index + 1)), []);

  const toggle = useCallback(
    (item: Picked) =>
      setPicked((p) => {
        if (p[item.path]) {
          const { [item.path]: _, ...rest } = p;
          return rest;
        }
        // Picking a folder covers what was picked inside it.
        const kept = Object.fromEntries(Object.entries(p).filter(([path]) => !path.startsWith(`${item.path}/`)));
        return { ...kept, [item.path]: item };
      }),
    [],
  );

  const pickedList = Object.values(picked);
  const pickedBytes = pickedList.reduce((s, i) => s + i.size, 0);
  /** A folder whose ancestor is picked is covered by it. */
  const coveredBy = useCallback(
    (path: string) => pickedList.find((i) => path !== i.path && path.startsWith(`${i.path}/`)) ?? null,
    [pickedList],
  );

  /** STUB: pretends to Move to Trash. Anything named "*.lock" or "*.sock" is skipped as in use. */
  const moveToTrash = useCallback(() => {
    const skipped = pickedList.filter((i) => /\.(lock|sock)$/.test(i.name)).map((item) => ({ item, reason: "In use" }));
    const moved = pickedList.filter((i) => !skipped.some((s) => s.item.path === i.path));
    setTrashed((t) => ({ ...t, ...Object.fromEntries(moved.map((i) => [i.path, i.size])) }));
    setPicked({});
    setCleanEpoch((e) => e + 1);
    setReport({ moved, skipped });
  }, [pickedList]);

  return {
    home,
    view,
    stack,
    open,
    goTo,
    measureAgain: () => measure(place.path, true),
    resultFor,
    prefetch,
    adjust,
    picked,
    pickedList,
    pickedBytes,
    toggle,
    coveredBy,
    clearPicked: () => setPicked({}),
    moveToTrash,
    report,
    dismissReport: () => setReport(null),
    pretendClean: () => setCleanEpoch((e) => e + 1),
  };
}

export type Space = ReturnType<typeof useSpace>;
