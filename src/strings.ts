// Every string the user sees. Components never hardcode text: they read it
// here, and strings with numbers or plurals are functions.
import type { BatteryState, HealthLevel, HealthReason, MemoryPressure, SkipReason } from "./mygo";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Between the parts of one line, e.g. "Apple M2 · 16.0 GB". */
const SEPARATOR = " · ";

const dayOfYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** "Firefox, Safari, and Arc". */
const andList = new Intl.ListFormat("en-US", { type: "conjunction" });

/** "21 days": the largest whole unit only. */
function duration(seconds: number): string {
  if (seconds < 60) return plural(seconds, "second", "seconds");
  if (seconds < 3_600) return plural(Math.floor(seconds / 60), "minute", "minutes");
  if (seconds < 86_400) return plural(Math.floor(seconds / 3_600), "hour", "hours");
  return plural(Math.floor(seconds / 86_400), "day", "days");
}

const skipReasons = {
  in_use: "in use",
  permission_denied: "permission denied",
  protected: "protected",
  already_gone: "already gone",
} as const satisfies Record<SkipReason, string>;

export const strings = {
  app: {
    name: "Burrow",
  },
  tabs: {
    label: "Tabs",
    clean: "Clean",
    status: "Status",
    space: "Space",
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
    cleanError: "Clean could not finish. Scan again to see what is left.",
    cleaning: {
      label: "Cleaning",
      /** The unit after the big number: "GB freed so far". */
      freedSoFar: (unit: string) => `${unit} freed so far`,
      /** Under the big number once Move to Trash groups ran: "1.2 GB moved to Trash so far". */
      trashedSoFar: (size: string) => `${size} moved to Trash so far`,
      groupProgress: (name: string) => `${name} clean progress`,
      /** "3 / 5": items removed of the group's selected items. */
      count: (cleaned: number, selected: number) => `${cleaned} / ${selected}`,
      skipped: (count: number) => `${count} skipped`,
      layerDone: "✓",
    },
    done: {
      label: "Clean summary",
      /** The unit after the big number: "GB freed". */
      freed: (unit: string) => `${unit} freed`,
      /** Under the big number when Move to Trash groups ran: "1.2 GB moved to Trash". */
      trashed: (size: string) => `${size} moved to Trash`,
      summary: (removed: number, skipped: number) => `${removed} removed · ${skipped} skipped`,
      /** One skipped item: "/Users/me/Library/Caches/x (in use)". */
      skippedItem: (path: string, reason: SkipReason) => `${path} (${skipReasons[reason]})`,
      finish: "Finish",
    },
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
      unreadable: "Protected access unavailable",
      /** Why a locked junk group cannot be selected: "Safari is open. Quit it to clean." */
      locked: (apps: readonly string[]) =>
        apps.length === 1
          ? `${andList.format(apps)} is open. Quit it to clean.`
          : `${andList.format(apps)} are open. Quit them to clean.`,
    },
    fullDiskAccess: {
      label: "Full Disk Access",
      explanation: "macOS kept Burrow out of some places. Grant Full Disk Access to include them.",
      action: "Open System Settings",
      opened: "Turn on Burrow in Full Disk Access, then scan again.",
      fallback: "In Privacy & Security, scroll to Full Disk Access, turn on Burrow, then scan again.",
      failed:
        "System Settings did not open. Open it from the Apple menu, go to Privacy & Security › Full Disk Access, and turn on Burrow.",
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
    memory: {
      title: "Memory",
      icon: "▤",
      pressure: "Pressure",
      pressures: {
        normal: "Normal",
        warn: "Warn",
        critical: "Critical",
      } satisfies Record<MemoryPressure, string>,
      usage: (used: string, total: string) => `${used} / ${total}`,
      swap: (size: string) => `${size} swap`,
    },
    network: {
      title: "Network",
      icon: "⇣",
      upload: (speed: string) => `Upload ${speed}`,
    },
    battery: {
      title: "Battery",
      icon: "⚡",
      states: {
        charging: "Charging",
        charged: "Charged",
        discharging: "Discharging",
      } satisfies Record<BatteryState, string>,
      capacity: (percent: string) => `${percent}% capacity`,
      details: (time: string, cycles: string) => `${time} remaining${SEPARATOR}${cycles} cycles`,
      device: (name: string, percent: number) => `${name} ${percent}%`,
    },
    power: {
      title: "Power",
      icon: "⚡",
      systemUnit: "W system",
      adapter: (watts: string) => `${watts} W adapter`,
      noBattery: "No battery",
    },
    disk: {
      title: "Disk",
      icon: "◐",
      root: "/",
      freeUnit: (unit: string) => `${unit} free`,
      meter: "Startup disk used",
      used: (size: string) => `Used ${size}`,
      purgeable: (size: string) => `Purgeable ${size}`,
      trash: (size: string) => `Trash ${size}`,
      trashUnavailable: "Trash Unavailable",
    },
    diskIO: {
      title: "Disk I/O",
      icon: "↕",
      readUnit: (unit: string) => `${unit} read`,
      write: (speed: string) => `Write ${speed}`,
    },
    thermal: {
      title: "Thermal",
      icon: "♨",
      temperatureUnit: "°C",
      power: (watts: string) => `Power ${watts} W`,
      fan: (rpm: string) => `${rpm} RPM`,
      fanUnavailable: "Fan -",
    },
    processes: {
      title: "Top processes",
      name: "Process",
      cpu: "CPU",
      /** After the CPU heading: the one order the table has. */
      sorted: "▾",
      memory: "Memory",
      pid: "PID",
    },
    retrying: "Status paused, retrying…",
  },
  space: {
    idle: {
      title: "See what takes up your disk.",
      description: "Space measures your Mac, folder by folder.",
      action: "Measure this Mac",
    },
    measuring: {
      label: "Measure progress",
      title: "Measuring…",
      /** What the overview Measure measures, under the title. */
      overview: "Applications, Library, your home folder and insights",
      hint: "The first Measure of the whole Mac can take a minute.",
      cancel: "Cancel",
    },
    error: "Measure could not finish. Try again.",
    overview: {
      /** The unit after the big number: "GB measured on this Mac". */
      total: (unit: string) => `${unit} measured on this Mac`,
      insights: "Insights",
      insightsHint: "Places that quietly grow",
      locations: "Locations",
      count: (count: number) => plural(count, "item", "items"),
    },
  },
  /** Shown in place of a value that could not be read. */
  unavailable: "-",
} as const;

/** Reasons in the catalog's words, joined for one line. */
export function healthReasons(reasons: readonly HealthReason[]): string {
  return reasons.map((reason) => strings.status.health.reasons[reason]).join(SEPARATOR);
}
