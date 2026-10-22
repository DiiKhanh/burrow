import { useEffect, useState } from "react";
import { events, type Snapshot } from "../mygo";
import { EmptyCard } from "./Card";
import { CpuCard } from "./CpuCard";
import { HealthCard } from "./HealthCard";

/** Cards still to land in the bento (Memory, Network, Battery, Disk, Disk I/O, Thermal). */
const PENDING_CARDS = ["memory", "network", "battery", "disk", "disk-io", "thermal"] as const;

/**
 * The Status tab: live system health in a 4x2 bento. Go sends a whole
 * Snapshot every second, history included, so the tab keeps only the latest.
 */
export function StatusTab() {
  const snapshot = useStatusSnapshot();
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-8 pt-8 pb-16">
      <div className="grid-bento grid shrink-0 gap-3">
        <HealthCard snapshot={snapshot} />
        <CpuCard snapshot={snapshot} />
        {PENDING_CARDS.map((card) => (
          <EmptyCard key={card} />
        ))}
      </div>
    </main>
  );
}

/** The latest Status snapshot, or null before the first one arrives. */
function useStatusSnapshot(): Snapshot | null {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => events.status.on(setSnapshot), []);
  return snapshot;
}
