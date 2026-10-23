import type { ReactNode } from "react";

type Props = {
  title: string;
  /** A glyph before the title, e.g. "◉". */
  icon: string;
  /** Colors the icon, e.g. "text-cpu". */
  tone: string;
  /** Top right, e.g. the CPU model. */
  badge?: string;
  /** Bottom line, e.g. load averages. */
  foot?: ReactNode;
  children: ReactNode;
};

/** One card of the Status bento, named for assistive technology by its title. */
export function Card({ title, icon, tone, badge, foot, children }: Props) {
  return (
    <section aria-label={title} className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <Label>
          <span className={tone} aria-hidden="true">
            {icon}
          </span>
          {title}
        </Label>
        {badge !== undefined && <Chip>{badge}</Chip>}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2">{children}</div>
      {foot !== undefined && <div className="tabular min-w-0 text-caption text-ink-faint">{foot}</div>}
    </section>
  );
}

/** A card's place in the bento before its content lands. */
export function EmptyCard() {
  return <div className={CARD} aria-hidden="true" />;
}

const CARD = "flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4";

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-semibold text-label uppercase tracking-label">
      {children}
    </span>
  );
}

/** A small rounded tag, e.g. "Apple M2 · 16.0 GB". */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="tabular truncate rounded-full bg-surface-raised px-2 py-0.5 font-mono text-ink-muted text-label leading-normal">
      {children}
    </span>
  );
}

/** A card's big number with its unit, e.g. "30 %", on one line: a narrow card cuts the unit short. */
export function Metric({ value, unit }: { value: string; unit?: string }) {
  return (
    <p className="tabular flex min-w-0 items-baseline font-bold text-metric">
      <span className="shrink-0">{value}</span>
      {unit !== undefined && <span className="ml-1 truncate font-semibold text-ink-muted text-unit">{unit}</span>}
    </p>
  );
}
