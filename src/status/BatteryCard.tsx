import { formatPercent } from "../format";
import type { Snapshot } from "../mygo";
import { strings } from "../strings";
import { Card, Chip, Metric } from "./Card";
import { formatInteger, formatWatts } from "./format";

const batteryText = strings.status.battery;
const powerText = strings.status.power;

export function BatteryOrPowerCard({ snapshot }: { snapshot: Snapshot | null }) {
  if (snapshot?.battery === null) return <PowerCard snapshot={snapshot} />;

  const battery = snapshot?.battery;
  const percent = battery?.percent ?? null;
  const state = battery?.state ?? null;
  const stateLabel = state === null ? strings.unavailable : batteryText.states[state];
  const capacity = battery?.maximumCapacity ?? null;
  return (
    <Card
      title={batteryText.title}
      icon={batteryText.icon}
      tone="text-ok"
      badge={capacity === null ? strings.unavailable : batteryText.capacity(formatInteger(capacity))}
      foot={batteryText.details(battery?.timeRemaining ?? strings.unavailable, formatInteger(battery?.cycles ?? null))}
    >
      <div className="flex min-w-0 items-end justify-between gap-2">
        <Metric
          value={formatPercent(percent)}
          unit={percent === null ? undefined : `${strings.units.percent} ${stateLabel}`}
        />
        <div className="flex min-w-0 flex-wrap justify-end gap-1">
          {(snapshot?.bluetooth ?? []).map((device) => (
            <Chip key={device.name}>
              {device.batteryPercent === null
                ? `${device.name} ${strings.unavailable}`
                : batteryText.device(device.name, device.batteryPercent)}
            </Chip>
          ))}
        </div>
      </div>
    </Card>
  );
}

function PowerCard({ snapshot }: { snapshot: Snapshot }) {
  const system = snapshot.power.systemWatts;
  return (
    <Card
      title={powerText.title}
      icon={powerText.icon}
      tone="text-ok"
      badge={powerText.adapter(formatWatts(snapshot.power.adapterWatts))}
      foot={powerText.noBattery}
    >
      <Metric value={formatWatts(system)} unit={system === null ? undefined : powerText.systemUnit} />
    </Card>
  );
}
