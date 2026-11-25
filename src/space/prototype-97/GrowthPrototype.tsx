// Three treatments of consecutive Measures on the Space route, switchable via ?variant=A|B|C.
import { useEffect, useState } from "react";
import { formatBytes } from "../../format";
import type { MeasureResult, SpaceItem } from "../../mygo";
import { strings } from "../../strings";
import { ItemSection, type Picker } from "../ItemSection";
import { earlier } from "./fixture";

const variants = ["A", "B", "C"] as const;
type Variant = (typeof variants)[number];
const names = { A: "Inline", B: "By direction", C: "Before & after" };
const heading = "font-mono font-semibold text-label text-ink-muted uppercase tracking-label";
const comparison = "Since last Measure";
type Props = { result: MeasureResult; onOpen: (item: SpaceItem) => void; picker: Picker };

function signed(bytes: number) {
  return bytes === 0 ? "Unchanged" : `${bytes > 0 ? "+" : "-"}${formatBytes(Math.abs(bytes))}`;
}

export function GrowthPrototype({ result, onOpen, picker }: Props) {
  const [variant, setVariant] = useState<Variant>(() => {
    const key = new URLSearchParams(location.search).get("variant");
    return variants.find((v) => v === key) ?? "A";
  });
  const previous = earlier.get(result);
  const rows = result.items.map((item) => {
    const before = previous?.items.find((old) => old.path === item.path);
    const change = item.readState === "complete" && before?.readState === "complete" ? item.bytes - before.bytes : null;
    return { item, before, change };
  });
  const delta = (item: SpaceItem) => {
    const bytes = rows.find((row) => row.item === item)?.change;
    if (bytes == null) return null;
    return (
      <span className={`font-mono text-caption tabular ${bytes === 0 ? "text-ink-muted" : "font-semibold text-ink"}`}>
        {signed(bytes)}
      </span>
    );
  };
  const section = {
    title: strings.space.folder.contents,
    items: result.items,
    picker,
    onOpen,
    hint: strings.space.count(result.items.length),
  };
  const changed = rows
    .flatMap(({ item, before, change }) => (before && change != null && change !== 0 ? [{ item, before, change }] : []))
    .sort((a, b) => b.change - a.change);
  return (
    <>
      {(!previous || variant === "A") && (
        <ItemSection {...section} hint={previous ? comparison : section.hint} change={previous ? delta : undefined} />
      )}
      {previous && variant === "B" && (
        <>
          <h2 className="font-semibold text-subhead">{comparison}</h2>
          {["Grew", "Shrank", "Unchanged", "Incomplete"].map((title) => {
            const items = rows
              .filter(
                ({ change }) =>
                  (change == null ? "Incomplete" : change > 0 ? "Grew" : change < 0 ? "Shrank" : "Unchanged") === title,
              )
              .map(({ item }) => item);
            return (
              items.length > 0 && (
                <ItemSection
                  {...section}
                  key={title}
                  title={title}
                  items={items}
                  hint={strings.space.count(items.length)}
                  change={delta}
                />
              )
            );
          })}
        </>
      )}
      {previous && variant === "C" && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className={heading}>{comparison}</h2>
            {changed.length ? (
              <table className="w-full rounded-card bg-surface text-caption tabular">
                <thead className="text-ink-muted">
                  <tr>
                    {["Folder", "Before", "Now", "Change"].map((col, i) => (
                      <th key={col} scope="col" className={`p-2 ${i ? "text-right" : "text-left"}`}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {changed.map(({ item, before, change }) => (
                    <tr key={item.id} className="border-line border-t">
                      <th scope="row" className="p-2 text-left font-medium">
                        {item.name}
                      </th>
                      <td className="p-2 text-right font-mono">{formatBytes(before.bytes)}</td>
                      <td className="p-2 text-right font-mono">{formatBytes(item.bytes)}</td>
                      <td className="p-2 text-right font-mono font-semibold">{signed(change)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-caption text-ink-muted">{"No changes among fully measured folders."}</p>
            )}
          </section>
          <ItemSection {...section} />
        </>
      )}
      <PrototypeSwitcher current={variant} onChange={setVariant} />
    </>
  );
}

function PrototypeSwitcher({ current, onChange }: { current: Variant; onChange: (v: Variant) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable || event.target.closest("input,textarea,select,[role=tab]")))
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        select(event.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, onChange]);
  function select(direction: number) {
    const next = variants[(variants.indexOf(current) + direction + variants.length) % variants.length] ?? "A";
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(null, "", url);
    onChange(next);
  }
  return (
    <aside
      aria-label="Prototype variants"
      className="fixed bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-pill px-2 py-1 text-caption text-pill-ink shadow-pill"
    >
      <button className="rounded-full px-2 py-1" type="button" aria-label="Previous variant" onClick={() => select(-1)}>
        ←
      </button>
      <span>{`Prototype · ${current} / ${names[current]}`}</span>
      <button className="rounded-full px-2 py-1" type="button" aria-label="Next variant" onClick={() => select(1)}>
        →
      </button>
    </aside>
  );
}
