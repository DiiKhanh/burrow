import { MeterBar } from "../charts/MeterBar";
import { formatBytes, formatBytesParts } from "../format";
import type { Snapshot } from "../mygo";
import { strings } from "../strings";
import { Card, Metric } from "./Card";

const text = strings.status.disk;

export function DiskCard({ snapshot }: { snapshot: Snapshot | null }) {
  const disk = snapshot?.disk;
  const free = formatBytesParts(disk?.free ?? null);
  const ratio = disk?.used != null && disk.total != null && disk.total > 0 ? disk.used / disk.total : null;
  return (
    <Card
      title={text.title}
      icon={text.icon}
      tone="text-disk"
      badge={text.root}
      foot={disk?.trash == null ? text.trashUnavailable : text.trash(formatBytes(disk.trash))}
    >
      <Metric value={free.value} unit={free.unit === undefined ? undefined : text.freeUnit(free.unit)} />
      <MeterBar value={ratio} label={text.meter} />
      <div className="tabular flex min-w-0 justify-between gap-1 text-ink-muted text-label">
        <span>{text.used(formatBytes(disk?.used ?? null))}</span>
        <span>{text.purgeable(formatBytes(disk?.purgeable ?? null))}</span>
      </div>
    </Card>
  );
}
