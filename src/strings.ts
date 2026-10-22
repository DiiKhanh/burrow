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
  units: {
    bytes: ["B", "KB", "MB", "GB", "TB", "PB", "EB"],
    speed: ["KB/s", "MB/s", "GB/s"],
  },
  /** Shown in place of a value that could not be read. */
  unavailable: "-",
} as const;
