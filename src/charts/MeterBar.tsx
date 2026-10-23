type Props = {
  /** A fraction from 0 to 1, or null when the reading is unavailable. */
  value: number | null;
  label: string;
  className?: string;
};

/** A compact horizontal meter with a clamped fill. */
export function MeterBar({ value, label, className }: Props) {
  const fraction = value === null || !Number.isFinite(value) ? null : Math.min(1, Math.max(0, value));
  const percent = Math.round((fraction ?? 0) * 100);
  return (
    <progress
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fraction === null ? undefined : percent}
      max={100}
      value={percent}
      className={`meter-progress block h-2.5 w-full text-disk ${className ?? ""}`}
    />
  );
}
