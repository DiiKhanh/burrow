import type { HealthLevel, Snapshot } from "../mygo";
import { healthReasons, strings } from "../strings";
import { Card, Chip, Metric } from "./Card";

const TONE: Record<HealthLevel, string> = {
  excellent: "text-ok",
  good: "text-ok",
  fair: "text-warn",
  "needs-attention": "text-danger",
};

const text = strings.status.health;

/** The Health score, why it is what it is, and what Mac this is. */
export function HealthCard({ snapshot }: { snapshot: Snapshot | null }) {
  const health = snapshot?.health;
  const hardware = snapshot?.hardware;
  const uptime = snapshot?.uptimeSeconds ?? null;
  const level = health?.level ?? null;
  return (
    <Card
      title={text.title}
      icon="◉"
      tone="text-ok"
      badge={text.chip(hardware?.cpuModel ?? strings.unavailable, hardware?.ram ?? strings.unavailable)}
      foot={uptime === null ? strings.unavailable : text.uptime(uptime)}
    >
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <Metric
            value={health?.score == null ? strings.unavailable : String(health.score)}
            unit={level === null ? undefined : text.levels[level]}
          />
          <p className={`mt-1 truncate text-note ${level === null ? "text-ink-muted" : TONE[level]}`}>
            {reason(health?.reasons ?? [], level)}
          </p>
        </div>
        <Chip>{hardware?.osVersion ?? strings.unavailable}</Chip>
      </div>
    </Card>
  );
}

/** The issues behind the score; with none, all clear once the level is known. */
function reason(reasons: Snapshot["health"]["reasons"], level: HealthLevel | null): string {
  if (reasons.length > 0) return healthReasons(reasons);
  return level === null ? "" : text.allClear;
}
