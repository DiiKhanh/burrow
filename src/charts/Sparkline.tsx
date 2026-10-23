import { coordinate, HEIGHT, SERIES_SLOTS, type Series, scaleMax, slotOf, WIDTH } from "./geometry";

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
  const top = scaleMax(data, max);
  const step = WIDTH / Math.max(1, slots - 1);
  let path = "";
  let drawing = false;
  data.forEach((value, i) => {
    if (value === null) {
      drawing = false;
      return;
    }
    const x = coordinate(slotOf(i, data, slots) * step);
    // A 1-unit margin keeps the stroke inside the box at 0 and at the top.
    const y = coordinate(HEIGHT - (Math.min(value, top) / top) * (HEIGHT - 2) - 1);
    path += `${drawing ? "L" : "M"}${x},${y}`;
    drawing = true;
  });
  return path;
}
