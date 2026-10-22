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

export const junkGroupCatalog: Record<JunkGroupID, { name: string; description: string }> = {
  "app-caches": strings.clean.groups.appCaches,
  browsers: strings.clean.groups.browsers,
  "logs-saved-state": strings.clean.groups.logsSavedState,
  trash: strings.clean.groups.trash,
  "developer-tools": strings.clean.groups.developerTools,
  virtualization: strings.clean.groups.virtualization,
  "app-leftovers": strings.clean.groups.appLeftovers,
  "device-firmware": strings.clean.groups.deviceFirmware,
};
