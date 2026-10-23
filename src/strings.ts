// Every string the user sees. Components never hardcode text: they read it
// here, and strings with numbers or plurals are functions.
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
    },
    idle: {
      title: "Let's see what can go.",
      description: "Burrow looks through caches, logs and leftovers. Nothing is removed until step 3.",
      action: "Start scan",
    },
    scanProgress: "Scan progress",
    scanResults: "Scan results",
    preparing: "Preparing scan…",
    cancel: "Cancel",
    scanError: "Scan could not finish. Try again.",
    pendingSize: "-",
    foundSoFar: (size: string) => `${size} found so far`,
    found: (size: string) => `${size} found`,
    groupProgress: (name: string) => `${name} scan progress`,
    groupResult: (name: string, size: string) => `${name}, ${size}`,
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
  },
  /** Shown in place of a value that could not be read. */
  unavailable: "-",
} as const;
