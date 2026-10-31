import { bytesParts } from "../format";
import type { SpaceItem } from "../mygo";

type Props = { bytes: number; label: (unit: string) => string; items: readonly SpaceItem[] };

/**
 * A Measure's big number, its unit leading the label: "146 GB measured on
 * this Mac". Nothing when none of the items could be read: 0 would be a size.
 */
export function Total({ bytes, label, items }: Props) {
  if (items.length > 0 && items.every((item) => item.readState === "unavailable")) return null;
  const { value, unit } = bytesParts(bytes);
  return (
    <p className="tabular font-bold text-metric leading-10">
      {value} <span className="text-ink-muted text-subhead">{label(unit)}</span>
    </p>
  );
}
