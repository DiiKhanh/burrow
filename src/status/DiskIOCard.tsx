import { Sparkline } from "../charts/Sparkline";
import { formatSpeed, formatSpeedParts } from "../format";
import type { Snapshot } from "../mygo";
import { strings } from "../strings";
import { Card, Metric } from "./Card";

const text = strings.status.diskIO;

export function DiskIOCard({ snapshot }: { snapshot: Snapshot | null }) {
  const diskIO = snapshot?.diskIO;
  const read = formatSpeedParts(diskIO?.readBytesPerSecond ?? null);
  return (
    <Card
      title={text.title}
      icon={text.icon}
      tone="text-disk"
      foot={text.write(formatSpeed(diskIO?.writeBytesPerSecond ?? null))}
    >
      <Metric value={read.value} unit={read.unit === undefined ? undefined : text.readUnit(read.unit)} />
      <Sparkline data={snapshot?.series.diskRead ?? []} className="h-8.5 w-full stroke-disk" />
    </Card>
  );
}
