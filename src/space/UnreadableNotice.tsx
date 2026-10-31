import type { MeasureResult } from "../mygo";
import { FullDiskAccessNotice } from "../shell/FullDiskAccessNotice";
import { strings } from "../strings";

/**
 * Full Disk Access, for a result listing an item Measure could not read at
 * all. A partial read does not ask: it says nothing about what is missing.
 */
export function UnreadableNotice({ result }: { result: MeasureResult }) {
  const unreadable = [...result.items, ...result.insights].some((item) => item.readState === "unavailable");
  return unreadable ? <FullDiskAccessNotice retryStep={strings.space.retryStep} /> : null;
}
