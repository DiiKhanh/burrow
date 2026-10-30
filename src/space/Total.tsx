import { bytesParts } from "../format";

/** A Measure's big number, its unit leading the label: "146 GB measured on this Mac". */
export function Total({ bytes, label }: { bytes: number; label: (unit: string) => string }) {
  const { value, unit } = bytesParts(bytes);
  return (
    <p className="tabular font-bold text-metric leading-10">
      {value} <span className="text-ink-muted text-subhead">{label(unit)}</span>
    </p>
  );
}
