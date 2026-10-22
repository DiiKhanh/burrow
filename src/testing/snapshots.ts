// Status snapshots for tests, shaped like the ones Go sends: Mole's real
// stream on a MacBook Air M2 (internal/mole/testdata/status-watch.ndjson).
import type { Snapshot } from "../mygo";

/** Fields to replace, each card's fields merged into the defaults. */
export type SnapshotOverrides = {
  [Key in keyof Snapshot]?: Snapshot[Key] extends object ? Partial<Snapshot[Key]> : Snapshot[Key];
};

/** A whole minute of CPU usage, oldest first. */
const cpuSeries = Array.from({ length: 60 }, (_, i) => 20 + ((i * 37) % 45));

export function snapshot(overrides: SnapshotOverrides = {}): Snapshot {
  const base: Snapshot = {
    health: { score: 78, level: "good", reasons: ["restart-recommended"] },
    hardware: { cpuModel: "Apple M2", ram: "16.0 GB", osVersion: "macOS 15.7.9" },
    uptimeSeconds: 1_841_478,
    cpu: { usage: 30.164, load1: 3.7602, load5: 3.1645, load15: 3.7465, pCores: 4, eCores: 4 },
    series: { cpu: cpuSeries },
  };
  return {
    health: { ...base.health, ...overrides.health },
    hardware: { ...base.hardware, ...overrides.hardware },
    uptimeSeconds: overrides.uptimeSeconds === undefined ? base.uptimeSeconds : overrides.uptimeSeconds,
    cpu: { ...base.cpu, ...overrides.cpu },
    series: { ...base.series, ...overrides.series },
  };
}
