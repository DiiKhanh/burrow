import { coordinate, HEIGHT, SERIES_SLOTS, type Series, scaleMax, slotOf, WIDTH } from "./geometry";

const GAP = 1.5;
/** Idle samples keep a sliver, so the chart never looks empty. */
const MIN_BAR = 1.5;

type Props = {
  data: Series;
  /** The value of a full-height bar; defaults to the largest sample. */
  max?: number;
  /** How many bars fit; the newest sample takes the last one. */
  slots?: number;
  /** Sizes and colors the chart, e.g. "h-8.5 w-full fill-cpu". */
  className?: string;
};

/** A column sparkline, older bars fading out. Missing samples leave gaps. */
export function BarSpark({ data, max, slots = SERIES_SLOTS, className }: Props) {
  const top = scaleMax(data, max);
  const slot = WIDTH / slots;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={`block min-w-0 ${className ?? ""}`}
      aria-hidden="true"
    >
      {data.map((value, i) => {
        if (value === null) return null;
        const position = slotOf(i, data, slots);
        const height = Math.max(MIN_BAR, (Math.min(value, top) / top) * HEIGHT);
        return (
          <rect
            // Bars are positions in time, never reordered, so the index is their key.
            key={i}
            x={coordinate(position * slot)}
            y={coordinate(HEIGHT - height)}
            width={coordinate(slot - GAP)}
            height={coordinate(height)}
            rx="1"
            opacity={coordinate(0.35 + 0.65 * (position / slots))}
          />
        );
      })}
    </svg>
  );
}
