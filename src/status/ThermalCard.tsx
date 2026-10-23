import { Sparkline } from "../charts/Sparkline";
import type { Snapshot } from "../mygo";
import { strings } from "../strings";
import { Card, Metric } from "./Card";
import { formatInteger, formatTemperature, formatWatts } from "./format";

const text = strings.status.thermal;

export function ThermalCard({ snapshot }: { snapshot: Snapshot | null }) {
  const thermal = snapshot?.thermal;
  const temperature = thermal?.cpuCelsius ?? null;
  const fan =
    thermal?.hasFan === false
      ? undefined
      : thermal?.hasFan === true
        ? text.fan(formatInteger(thermal.fanRPM))
        : text.fanUnavailable;
  return (
    <Card
      title={text.title}
      icon={text.icon}
      tone="text-warn"
      badge={fan}
      foot={text.power(formatWatts(thermal?.systemWatts ?? null))}
    >
      <Metric value={formatTemperature(temperature)} unit={temperature === null ? undefined : text.temperatureUnit} />
      <Sparkline data={snapshot?.series.thermalCPU ?? []} className="h-8.5 w-full stroke-warn" />
    </Card>
  );
}
