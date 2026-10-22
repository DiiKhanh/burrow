import { BarSpark } from "../charts/BarSpark";
import { formatLoad, formatPercent } from "../format";
import type { Snapshot } from "../mygo";
import { strings } from "../strings";
import { Card, Metric } from "./Card";

const text = strings.status.cpu;

/** CPU usage over the last minute, load averages and the core split. */
export function CpuCard({ snapshot }: { snapshot: Snapshot | null }) {
  const cpu = snapshot?.cpu;
  const usage = cpu?.usage ?? null;
  const pCores = cpu?.pCores ?? null;
  const eCores = cpu?.eCores ?? null;
  return (
    <Card
      title={text.title}
      icon="▦"
      tone="text-cpu"
      badge={pCores === null || eCores === null ? undefined : text.cores(pCores, eCores)}
      foot={text.load(formatLoad(cpu?.load1 ?? null), formatLoad(cpu?.load5 ?? null), formatLoad(cpu?.load15 ?? null))}
    >
      <Metric value={formatPercent(usage)} unit={usage === null ? undefined : strings.units.percent} />
      <BarSpark data={snapshot?.series.cpu ?? []} max={100} className="h-8.5 w-full fill-cpu" />
    </Card>
  );
}
