import { AreaSpark } from "../charts/AreaSpark";
import { formatBytes, formatPercent } from "../format";
import type { Snapshot } from "../mygo";
import { strings } from "../strings";
import { Card, Metric } from "./Card";

const text = strings.status.memory;

export function MemoryCard({ snapshot }: { snapshot: Snapshot | null }) {
  const memory = snapshot?.memory;
  const pressure = memory?.pressure ?? null;
  return (
    <Card
      title={text.title}
      icon={text.icon}
      tone="text-mem"
      badge={pressure === null ? `${text.pressure} ${strings.unavailable}` : text.pressures[pressure]}
      foot={
        <div className="flex min-w-0 items-center justify-between gap-2 text-label">
          <span className="truncate">
            {text.usage(formatBytes(memory?.used ?? null), formatBytes(memory?.total ?? null))}
          </span>
          <span className="shrink-0">{text.swap(formatBytes(memory?.swapUsed ?? null))}</span>
        </div>
      }
    >
      <Metric
        value={formatPercent(memory?.usedPercent ?? null)}
        unit={memory?.usedPercent == null ? undefined : strings.units.percent}
      />
      <AreaSpark data={snapshot?.series.memory ?? []} max={100} className="h-8.5 w-full text-mem" />
    </Card>
  );
}
