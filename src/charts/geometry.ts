// Shared drawing space of the sparklines. Each SVG stretches this box to
// its element's size, so callers size charts with classes only.

/** The drawing box; strokes keep their width when it stretches. */
export const WIDTH = 240;
export const HEIGHT = 40;

/** A minute of samples, one a second: the series the engine keeps. */
export const SERIES_SLOTS = 60;

export type Series = readonly (number | null)[];

/** The scale's top: the given maximum, else the largest sample (at least 1). */
export function scaleMax(data: Series, max: number | undefined): number {
  if (max !== undefined) return max;
  return Math.max(1, ...data.filter((value) => value !== null));
}

/** Where sample i of data sits among slots, the newest in the last one. */
export function slotOf(i: number, data: Series, slots: number): number {
  return slots - data.length + i;
}

/** Rounds a coordinate to keep the markup short. */
export function coordinate(value: number): number {
  return Number(value.toFixed(1));
}
