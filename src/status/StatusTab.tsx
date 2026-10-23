import { useEffect, useState } from "react";
import { events, type Snapshot } from "../mygo";
import { BatteryOrPowerCard } from "./BatteryCard";
import { CpuCard } from "./CpuCard";
import { DiskCard } from "./DiskCard";
import { DiskIOCard } from "./DiskIOCard";
import { HealthCard } from "./HealthCard";
import { MemoryCard } from "./MemoryCard";
import { NetworkCard } from "./NetworkCard";
import { ThermalCard } from "./ThermalCard";

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
        <MemoryCard snapshot={snapshot} />
        <NetworkCard snapshot={snapshot} />
        <BatteryOrPowerCard snapshot={snapshot} />
        <DiskCard snapshot={snapshot} />
        <DiskIOCard snapshot={snapshot} />
        <ThermalCard snapshot={snapshot} />
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
