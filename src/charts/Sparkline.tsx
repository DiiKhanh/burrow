import { HEIGHT, lineThrough, pointRuns, SERIES_SLOTS, type Series, WIDTH } from "./geometry";

type Props = {
  data: Series;
  /** The value at the top edge; defaults to the largest sample. */
  max?: number;
  /** How many samples fit; the newest sample sits at the right edge. */
  slots?: number;
  /** Sizes and colors the chart, e.g. "h-8.5 w-full stroke-net". */
  className?: string;
};

/** A line sparkline. A missing sample breaks the line. */
export function Sparkline({ data, max, slots = SERIES_SLOTS, className }: Props) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={`block min-w-0 fill-none ${className ?? ""}`}
      aria-hidden="true"
    >
      <path d={linePath(data, max, slots)} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** "M0,39L240,1": moves to the first sample after each gap, lines to the rest. */
export function linePath(data: Series, max: number | undefined, slots: number): string {
  return pointRuns(data, max, slots).map(lineThrough).join("");
}
