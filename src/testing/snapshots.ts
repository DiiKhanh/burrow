// Status snapshots for tests, shaped like the ones Go sends: Mole's real
// stream on a MacBook Air M2 (internal/mole/testdata/status-watch.ndjson).
import type { Snapshot } from "../mygo";

type MergeableSnapshotField =
  | "healthScore"
  | "hardware"
  | "cpu"
  | "memory"
  | "network"
  | "power"
  | "disk"
  | "diskIO"
  | "thermal"
  | "series";

/** Fields to replace, with each object-valued card merged into the defaults. */
export type SnapshotOverrides = Omit<Partial<Snapshot>, MergeableSnapshotField> & {
  [Key in MergeableSnapshotField]?: Partial<Snapshot[Key]>;
};

/** A whole minute of CPU usage, oldest first. */
const cpuSeries = Array.from({ length: 60 }, (_, i) => 20 + ((i * 37) % 45));
const memorySeries = Array.from({ length: 60 }, (_, i) => 70 + ((i * 7) % 15));
const networkSeries = Array.from({ length: 60 }, (_, i) => 100_000 + ((i * 97_531) % 2_000_000));
const diskReadSeries = Array.from({ length: 60 }, (_, i) => (i * 313_337) % 8_000_000);
const thermalSeries = Array.from({ length: 60 }, (_, i) => 42 + ((i * 5) % 14));

export function snapshot(overrides: SnapshotOverrides = {}): Snapshot {
  const base: Snapshot = {
    healthScore: { score: 78, level: "good", reasons: ["restart-recommended"] },
    hardware: { cpuModel: "Apple M2", ram: "16.0 GB", osVersion: "macOS 15.7.9" },
    uptimeSeconds: 1_841_478,
    cpu: { usage: 30.164, load1: 3.7602, load5: 3.1645, load15: 3.7465, pCores: 4, eCores: 4 },
    memory: {
      used: 14_207_320_064,
      total: 17_179_869_184,
      usedPercent: 82.69,
      swapUsed: 15_866_462_208,
      pressure: "normal",
    },
    network: { downloadBytesPerSecond: 450_000, uploadBytesPerSecond: 57_000, interface: "en0" },
    battery: { percent: 100, state: "charged", timeRemaining: "0:00", cycles: 486, maximumCapacity: 83 },
    power: { systemWatts: 12.933, adapterWatts: 30 },
    disk: {
      free: 14_023_409_728,
      used: 231_083_786_176,
      total: 245_107_195_904,
      purgeable: 191_340_608,
      trash: 42_000_000,
    },
    diskIO: { readBytesPerSecond: 2_500_000, writeBytesPerSecond: 400_000 },
    thermal: { cpuCelsius: 52.5, systemWatts: 12.933, hasFan: false, fanRPM: null },
    bluetooth: [{ name: "Magic Mouse", batteryPercent: 64 }],
    series: {
      cpu: cpuSeries,
      memory: memorySeries,
      networkDownload: networkSeries,
      diskRead: diskReadSeries,
      thermalCPU: thermalSeries,
    },
  };
  return {
    healthScore: { ...base.healthScore, ...overrides.healthScore },
    hardware: { ...base.hardware, ...overrides.hardware },
    uptimeSeconds: overrides.uptimeSeconds === undefined ? base.uptimeSeconds : overrides.uptimeSeconds,
    cpu: { ...base.cpu, ...overrides.cpu },
    memory: { ...base.memory, ...overrides.memory },
    network: { ...base.network, ...overrides.network },
    battery: overrides.battery === undefined ? base.battery : overrides.battery,
    power: { ...base.power, ...overrides.power },
    disk: { ...base.disk, ...overrides.disk },
    diskIO: { ...base.diskIO, ...overrides.diskIO },
    thermal: { ...base.thermal, ...overrides.thermal },
    bluetooth: overrides.bluetooth === undefined ? base.bluetooth : overrides.bluetooth,
    series: { ...base.series, ...overrides.series },
  };
}
