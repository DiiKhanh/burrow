// Throwaway fixture for #97. The first successful Measure in this folder precedes the build.
import type { MeasureResult, MeasureTarget, SpaceItem } from "../../mygo";

export const project = "/Users/test/Projects/burrow";
export const inPrototype =
  import.meta.env.DEV && import.meta.env.MODE === "fake" && new URLSearchParams(location.search).has("variant");
export const earlier = new WeakMap<MeasureResult, MeasureResult>();
let last: MeasureResult | undefined;

export function measureProject(target: MeasureTarget, measuredAt: string): MeasureResult {
  function folder(name: string, megabytes: number, readState: SpaceItem["readState"] = "complete"): SpaceItem {
    const path = `${project}/${name}`;
    return {
      id: `id:${path}`,
      name,
      path,
      isDir: true,
      opens: { kind: "folder", path },
      bytes: megabytes * 1e6,
      readState,
      tags: [],
      blocked: null,
    };
  }
  const items = [
    folder("assets", 900),
    folder("build", last ? 300 : 100),
    folder("cache", last ? 120 : 180),
    folder("reports", last ? 64 : 48),
    folder("archives", last ? 48 : 32, "partial"),
  ].sort((a, b) => b.bytes - a.bytes);
  const result = {
    target,
    measuredAt,
    items,
    insights: [],
    totalBytes: items.reduce((sum, item) => sum + item.bytes, 0),
  };
  if (last) earlier.set(result, last);
  last = result;
  return result;
}
