import { useId, useMemo } from "react";
import { formatBytes } from "../format";
import type { SpaceItem } from "../mygo";
import { strings } from "../strings";

type Props = { before: readonly SpaceItem[]; now: readonly SpaceItem[] };

export function MeasureChanges({ before, now }: Props) {
  const titleId = useId();
  const labels = strings.space.folder.changes;
  const rows = useMemo(() => {
    const baseline = new Map(
      before.filter((item) => item.readState === "complete").map((item) => [item.id, item.bytes]),
    );
    const changed = now.flatMap((item) => {
      const bytes = baseline.get(item.id);
      if (item.readState !== "complete" || bytes === undefined || bytes === item.bytes) return [];
      return [{ item, before: bytes, delta: item.bytes - bytes }];
    });
    return changed.sort((a, b) => b.delta - a.delta);
  }, [before, now]);

  return (
    <section className="flex flex-col gap-2">
      <h2 id={titleId} className="px-1 font-mono font-semibold text-label text-ink-muted uppercase tracking-label">
        {labels.title}
      </h2>
      {rows.length ? (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table aria-labelledby={titleId} className="w-full text-right text-caption tabular">
            <thead className="text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">
                  {labels.item}
                </th>
                {[labels.before, labels.now, labels.change].map((label) => (
                  <th key={label} scope="col" className="px-3 py-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, before: bytes, delta }) => (
                <tr key={item.id} className="border-line border-t">
                  <th scope="row" className="break-all px-3 py-2 text-left font-medium text-note">
                    {item.name}
                  </th>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">{formatBytes(bytes)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">{formatBytes(item.bytes)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold">
                    {labels.signedSize(delta > 0, formatBytes(Math.abs(delta)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-1 text-caption text-ink-muted">{labels.empty}</p>
      )}
    </section>
  );
}
