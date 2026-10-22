// PROTOTYPE: fake Clean flow (idle > scanning > found > review > cleaning > done), in memory only.
import { useEffect, useMemo, useState } from "react";
import { ALL_ITEMS, JUNK_GROUPS, SCAN_SECTIONS, type JunkGroup, type JunkItem } from "../mock/clean";

export type Phase = "idle" | "scanning" | "found" | "review" | "cleaning" | "done";
export type CleanedEntry = { item: JunkItem; group: JunkGroup; outcome: "done" | "skipped" };
export type GroupSelection = "all" | "some" | "none";

const SCAN_MS = 4200;
const ITEM_MS = 320;

const selectable = (g: JunkGroup) => !g.lockedReason;
const recommendedIds = () =>
  new Set(JUNK_GROUPS.filter((g) => g.recommended && selectable(g)).flatMap((g) => g.items.map((i) => i.id)));

export function useCleanFlow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [scanPct, setScanPct] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(recommendedIds);
  const [cleaned, setCleaned] = useState<CleanedEntry[]>([]);

  useEffect(() => {
    if (phase !== "scanning") return;
    const started = performance.now();
    const id = setInterval(() => {
      const pct = Math.min(1, (performance.now() - started) / SCAN_MS);
      setScanPct(pct);
      if (pct >= 1) setPhase("found");
    }, 80);
    return () => clearInterval(id);
  }, [phase]);

  const queue = useMemo(
    () =>
      JUNK_GROUPS.flatMap((group) =>
        group.items.filter((i) => selected.has(i.id)).map((item) => ({ item, group })),
      ),
    [selected],
  );

  useEffect(() => {
    if (phase !== "cleaning") return;
    if (cleaned.length >= queue.length) {
      const t = setTimeout(() => setPhase("done"), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      const next = queue[cleaned.length];
      setCleaned((prev) => [...prev, { ...next, outcome: next.item.inUse ? "skipped" : "done" }]);
    }, ITEM_MS);
    return () => clearTimeout(t);
  }, [phase, cleaned, queue]);

  const sectionIdx = Math.min(SCAN_SECTIONS.length - 1, Math.floor(scanPct * SCAN_SECTIONS.length));
  const scanPath = ALL_ITEMS[Math.floor(scanPct * 997) % ALL_ITEMS.length].path;
  const selectedBytes = ALL_ITEMS.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.bytes, 0);
  const freedBytes = cleaned.filter((c) => c.outcome === "done").reduce((s, c) => s + c.item.bytes, 0);

  function groupSelection(g: JunkGroup): GroupSelection {
    const n = g.items.filter((i) => selected.has(i.id)).length;
    return n === 0 ? "none" : n === g.items.length ? "all" : "some";
  }

  function setGroup(g: JunkGroup, on: boolean) {
    if (!selectable(g)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      g.items.forEach((i) => (on ? next.add(i.id) : next.delete(i.id)));
      return next;
    });
  }

  function toggleItem(g: JunkGroup, item: JunkItem) {
    if (!selectable(g)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  return {
    phase,
    scanPct,
    scanSection: SCAN_SECTIONS[sectionIdx],
    scanPath,
    selected,
    selectedBytes,
    selectedCount: selected.size,
    queue,
    cleaned,
    freedBytes,
    skippedCount: cleaned.filter((c) => c.outcome === "skipped").length,
    groupSelection,
    setGroup,
    toggleItem,
    startScan: () => {
      setScanPct(0);
      setCleaned([]);
      setPhase("scanning");
    },
    cancelScan: () => setPhase("idle"),
    openReview: () => setPhase("review"),
    closeReview: () => setPhase("found"),
    selectAll: () => setSelected(new Set(JUNK_GROUPS.filter(selectable).flatMap((g) => g.items.map((i) => i.id)))),
    selectNone: () => setSelected(new Set()),
    selectRecommended: () => setSelected(recommendedIds()),
    startClean: () => {
      setCleaned([]);
      setPhase("cleaning");
    },
    reset: () => {
      setSelected(recommendedIds());
      setCleaned([]);
      setPhase("idle");
    },
  };
}

export type CleanFlow = ReturnType<typeof useCleanFlow>;
