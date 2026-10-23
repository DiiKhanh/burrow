import { useEffect, useState } from "react";
import { events, type Snapshot } from "../mygo";
import { strings } from "../strings";
import { BatteryOrPowerCard } from "./BatteryCard";
import { CpuCard } from "./CpuCard";
import { DiskCard } from "./DiskCard";
import { DiskIOCard } from "./DiskIOCard";
import { HealthCard } from "./HealthCard";
import { MemoryCard } from "./MemoryCard";
import { NetworkCard } from "./NetworkCard";
import { ProcessTable } from "./ProcessTable";
import { ThermalCard } from "./ThermalCard";

/**
 * The Status tab: live system health in a 4x2 bento over the top processes.
 * Go sends a whole Snapshot every second, history included, so the tab
 * keeps only the latest. While Go restarts the collector it sends the last
 * values again, which the tab dims.
 */
export function StatusTab() {
  const snapshot = useStatusSnapshot();
  const retrying = snapshot?.collector === "retrying";
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Over the top padding, so pausing moves nothing, and outside the
          scrolling area, so it stays in view. */}
      {retrying && (
        <p
          role="status"
          className="absolute top-1.5 left-6 z-10 rounded-full bg-status-top px-2 py-0.5 text-caption text-warn shadow-pill"
        >
          {strings.status.retrying}
        </p>
      )}
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-8 pt-8 pb-16">
        <div
          className={`flex shrink-0 grow flex-col gap-3 transition-opacity duration-300 ${retrying ? "opacity-50" : ""}`}
        >
          <div className="grid-bento grid gap-3">
            <HealthCard snapshot={snapshot} />
            <CpuCard snapshot={snapshot} />
            <MemoryCard snapshot={snapshot} />
            <NetworkCard snapshot={snapshot} />
            <BatteryOrPowerCard snapshot={snapshot} />
            <DiskCard snapshot={snapshot} />
            <DiskIOCard snapshot={snapshot} />
            <ThermalCard snapshot={snapshot} />
          </div>
          <ProcessTable processes={snapshot?.processes ?? []} />
        </div>
      </main>
    </div>
  );
}

/** The latest Status snapshot, or null before the first one arrives. */
function useStatusSnapshot(): Snapshot | null {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => events.status.on(setSnapshot), []);
  return snapshot;
}
