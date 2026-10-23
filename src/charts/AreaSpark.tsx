import { useId } from "react";
import { HEIGHT, lineThrough, pointRuns, SERIES_SLOTS, type Series, WIDTH } from "./geometry";

type Props = {
  data: Series;
  /** The value at the top edge; defaults to the largest sample. */
  max?: number;
  /** How many samples fit; the newest sample sits at the right edge. */
  slots?: number;
  /** Sizes and colors the chart, e.g. "h-8.5 w-full text-mem". */
  className?: string;
};

/** A line sparkline with a soft fill under every uninterrupted run. */
export function AreaSpark({ data, max, slots = SERIES_SLOTS, className }: Props) {
  const gradient = useId();
  const paths = areaPaths(data, max, slots);
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={`block min-w-0 ${className ?? ""}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {paths.map(({ line, area }) => (
        <g key={line}>
          <path d={area} fill={`url(#${gradient})`} />
          <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  );
}

function areaPaths(data: Series, max: number | undefined, slots: number): { line: string; area: string }[] {
  return pointRuns(data, max, slots).map((points) => {
    const line = lineThrough(points);
    const firstX = points[0]?.x ?? 0;
    const lastX = points.at(-1)?.x ?? firstX;
    return { line, area: `${line}L${lastX},${HEIGHT}L${firstX},${HEIGHT}Z` };
  });
}
