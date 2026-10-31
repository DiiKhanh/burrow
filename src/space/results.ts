// What Space keeps of its Measures: results by target, and how they stand once
// items leave the disk.
import type { MeasureResult, MeasureTarget, SpaceItem } from "../mygo";

/** Results are kept per target; the UI only sends back targets Go gave it, so equal targets serialize alike. */
export function keyOf(target: MeasureTarget): string {
  return JSON.stringify(target);
}

/** path lies strictly below folder. */
export function isInside(folder: string, path: string): boolean {
  return path.startsWith(`${folder}/`);
}

function isAtOrInside(folder: string, path: string): boolean {
  return path === folder || isInside(folder, path);
}

/** Every Space item one result lists, in any of its lists. */
export function allItems(result: MeasureResult): SpaceItem[] {
  return [...result.items, ...result.insights, ...(result.largestFiles ?? [])];
}

/** A Space item no longer on disk, with the size it took up. */
export type Gone = { path: string; bytes: number };

/**
 * Whether row's size counts path. Home's row leaves out ~/Library, and Old
 * Downloads counts only what its own result lists: until opened, what it
 * counts is unknown, so it keeps its size.
 */
function rowCounts(row: SpaceItem, path: string, results: ReadonlyMap<string, MeasureResult>): boolean {
  if (!isInside(row.path, path)) return false;
  if (row.opens?.excludeLibrary) return !isAtOrInside(`${row.path}/Library`, path);
  if (!row.opens?.olderThanDays) return true;
  const old = results.get(keyOf(row.opens));
  return old?.items.some((item) => isAtOrInside(item.path, path)) ?? false;
}

/** A list of one result without what is gone, what holds it smaller, largest first as Go sends it. */
function listWithout(list: readonly SpaceItem[], gone: readonly Gone[], results: ReadonlyMap<string, MeasureResult>) {
  return list
    .filter((row) => !gone.some(({ path }) => isAtOrInside(path, row.path)))
    .map((row) => {
      const inside = gone.filter(({ path }) => rowCounts(row, path, results));
      const bytes = inside.reduce((left, { bytes: size }) => left - size, row.bytes);
      return { ...row, bytes: Math.max(0, bytes) };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

/** Every result as it stands once gone left the disk, a folder gone with its own: Space need not Measure to show it. */
export function withoutGone(
  results: ReadonlyMap<string, MeasureResult>,
  gone: readonly Gone[],
): ReadonlyMap<string, MeasureResult> {
  const left = [...results].filter(([, { target }]) => !isGone(target, gone));
  const next = left.map(([key, result]): [string, MeasureResult] => {
    const items = listWithout(result.items, gone, results);
    return [
      key,
      {
        ...result,
        items,
        insights: listWithout(result.insights, gone, results),
        largestFiles: result.largestFiles && listWithout(result.largestFiles, gone, results),
        totalBytes: items.reduce((sum, item) => sum + item.bytes, 0),
      },
    ];
  });
  return new Map(next);
}

/** The folder target measures is gone, or lies in what is. */
export function isGone({ path }: MeasureTarget, gone: readonly Gone[]): boolean {
  return path !== undefined && gone.some((item) => isAtOrInside(item.path, path));
}
