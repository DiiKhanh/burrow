// Every string the user sees. Components never hardcode text: they read it
// here, and strings with numbers or plurals are functions.
import type { HealthLevel, HealthReason } from "./mygo";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Between the parts of one line, e.g. "Apple M2 · 16.0 GB". */
const SEPARATOR = " · ";

const dayOfYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** "21 days": the largest whole unit only. */
function duration(seconds: number): string {
  if (seconds < 60) return plural(seconds, "second", "seconds");
  if (seconds < 3_600) return plural(Math.floor(seconds / 60), "minute", "minutes");
  if (seconds < 86_400) return plural(Math.floor(seconds / 3_600), "hour", "hours");
  return plural(Math.floor(seconds / 86_400), "day", "days");
}

export const strings = {
  app: {
    name: "Burrow",
  },
  tabs: {
    label: "Tabs",
    clean: "Clean",
    status: "Status",
  },
  units: {
    bytes: ["B", "KB", "MB", "GB", "TB", "PB", "EB"],
    speed: ["KB/s", "MB/s", "GB/s"],
    percent: "%",
  },
  status: {
    health: {
      title: "Health",
      icon: "◉",
      levels: {
        excellent: "Excellent",
        good: "Good",
        fair: "Fair",
        "needs-attention": "Needs Attention",
      } satisfies Record<HealthLevel, string>,
      reasons: {
        "high-cpu": "High CPU",
        "high-memory": "High memory",
        "memory-pressure": "Memory pressure",
        "critical-memory": "Critical memory",
        "disk-almost-full": "Disk almost full",
        "disk-smart-failing": "Disk failing",
        overheating: "Overheating",
        "heavy-disk-io": "Heavy disk I/O",
        "battery-service-soon": "Battery needs service",
        "restart-recommended": "Restart recommended",
      } satisfies Record<HealthReason, string>,
      allClear: "All checks passed",
      /** "Apple M2 · 16.0 GB" */
      chip: (cpuModel: string, ram: string) => [cpuModel, ram].join(SEPARATOR),
      /** "up 21 days · since Oct 2": how long since the Mac started, and when. */
      uptime: (seconds: number, now: Date) =>
        [`up ${duration(seconds)}`, `since ${dayOfYear.format(now.getTime() - seconds * 1000)}`].join(SEPARATOR),
    },
    cpu: {
      title: "CPU",
      icon: "▦",
      /** "Load 3.76 · 3.16 · 3.75": 1, 5 and 15 minute averages. */
      load: (load1: string, load5: string, load15: string) => `Load ${[load1, load5, load15].join(SEPARATOR)}`,
      /** "4P + 4E cores": performance and efficiency cores. */
      cores: (performance: number, efficiency: number) => `${performance}P + ${efficiency}E cores`,
    },
  },
  /** Shown in place of a value that could not be read. */
  unavailable: "-",
} as const;

/** Reasons in the catalog's words, joined for one line. */
export function healthReasons(reasons: readonly HealthReason[]): string {
  return reasons.map((reason) => strings.status.health.reasons[reason]).join(SEPARATOR);
}
