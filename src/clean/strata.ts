// What the Scan and Clean Stratas share: each junk group is a soil layer, and
// layers not yet reached fade with depth.

/** Classes every Strata layer starts from. */
export const STRATA_LAYER =
  "relative flex h-9 items-center gap-3 border-line px-4 text-body not-last:border-b motion-safe:transition-colors";

const PENDING_OPACITY = [
  "opacity-95",
  "opacity-90",
  "opacity-85",
  "opacity-80",
  "opacity-75",
  "opacity-70",
  "opacity-65",
  "opacity-60",
] as const;

/** The fade of a layer not yet reached, deeper layers fainter. */
export function pendingOpacity(depth: number): string {
  return PENDING_OPACITY[Math.min(depth, PENDING_OPACITY.length - 1)] ?? "";
}
