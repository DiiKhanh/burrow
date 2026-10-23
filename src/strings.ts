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
  clean: {
    steps: {
      label: "Clean progress",
      items: ["Scan", "Review", "Clean", "Done"],
      done: "✓",
    },
    idle: {
      title: "Let's see what can go.",
      description: "Burrow looks through caches, logs and leftovers. Nothing is removed until step 3.",
      action: "Start scan",
    },
    scanProgress: "Scan progress",
    preparing: "Preparing scan…",
    cancel: "Cancel",
    scanError: "Scan could not finish. Try again.",
    pendingSize: "-",
    foundSoFar: (size: string) => `${size} found so far`,
    groupProgress: (name: string) => `${name} scan progress`,
    review: {
      groups: "Junk groups",
      /** The unit after the big number: "GB selected". */
      selected: (unit: string) => `${unit} selected`,
      breakdown: "Selection by junk group",
      /** One color bar segment: "App Caches, 1.2 GB". */
      segment: (name: string, size: string) => `${name}, ${size}`,
      /** "3/5": selected items of all the group's items. */
      count: (selected: number, total: number) => `${selected}/${total}`,
      movesToTrash: "moves to Trash",
      showItems: (name: string) => `${name} items`,
      chevron: "›",
      scanAgain: "← Scan again",
      clean: (count: number) => `Clean ${plural(count, "item", "items")} →`,
    },
    groups: {
      appCaches: { name: "App Caches", description: "Temporary files apps rebuild on next launch." },
      browsers: { name: "Browsers", description: "Browser caches. Sites may load slower the first time." },
      logsSavedState: { name: "Logs & Saved State", description: "Old logs and window restore data." },
      trash: { name: "Trash", description: "Items already placed in Trash." },
      developerTools: { name: "Developer Tools", description: "Build products and package-manager caches." },
      virtualization: { name: "Virtualization", description: "Unused virtual-machine data." },
      appLeftovers: { name: "App Leftovers", description: "Files left behind by apps you removed." },
      deviceFirmware: { name: "Device Firmware", description: "Downloaded iPhone and iPad firmware files." },
    },
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
