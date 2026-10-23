import type { JunkGroupID } from "../mygo";
import { strings } from "../strings";

export const JUNK_GROUP_ORDER = [
  "app-caches",
  "browsers",
  "logs-saved-state",
  "trash",
  "developer-tools",
  "virtualization",
  "app-leftovers",
  "device-firmware",
] as const satisfies readonly JunkGroupID[];

type JunkGroupEntry = {
  name: string;
  description: string;
  /** Colors the group's dot, e.g. "bg-group-trash". */
  dot: string;
  /** Colors the group's color bar segment, e.g. "fill-group-trash". */
  fill: string;
};

export const junkGroupCatalog: Record<JunkGroupID, JunkGroupEntry> = {
  "app-caches": { ...strings.clean.groups.appCaches, dot: "bg-group-app-caches", fill: "fill-group-app-caches" },
  browsers: { ...strings.clean.groups.browsers, dot: "bg-group-browsers", fill: "fill-group-browsers" },
  "logs-saved-state": {
    ...strings.clean.groups.logsSavedState,
    dot: "bg-group-logs-saved-state",
    fill: "fill-group-logs-saved-state",
  },
  trash: { ...strings.clean.groups.trash, dot: "bg-group-trash", fill: "fill-group-trash" },
  "developer-tools": {
    ...strings.clean.groups.developerTools,
    dot: "bg-group-developer-tools",
    fill: "fill-group-developer-tools",
  },
  virtualization: {
    ...strings.clean.groups.virtualization,
    dot: "bg-group-virtualization",
    fill: "fill-group-virtualization",
  },
  "app-leftovers": {
    ...strings.clean.groups.appLeftovers,
    dot: "bg-group-app-leftovers",
    fill: "fill-group-app-leftovers",
  },
  "device-firmware": {
    ...strings.clean.groups.deviceFirmware,
    dot: "bg-group-device-firmware",
    fill: "fill-group-device-firmware",
  },
};
