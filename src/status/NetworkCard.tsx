import { Sparkline } from "../charts/Sparkline";
import { formatSpeed, formatSpeedParts } from "../format";
import type { Snapshot } from "../mygo";
import { strings } from "../strings";
import { Card, Metric } from "./Card";

const text = strings.status.network;

export function NetworkCard({ snapshot }: { snapshot: Snapshot | null }) {
  const network = snapshot?.network;
  const download = formatSpeedParts(network?.downloadBytesPerSecond ?? null);
  return (
    <Card
      title={text.title}
      icon={text.icon}
      tone="text-net"
      badge={network?.interface ?? strings.unavailable}
      foot={text.upload(formatSpeed(network?.uploadBytesPerSecond ?? null))}
    >
      <Metric value={download.value} unit={download.unit} />
      <Sparkline data={snapshot?.series.networkDownload ?? []} className="h-8.5 w-full stroke-net" />
    </Card>
  );
}
