import { bytesParts, formatBytes } from "../format";
import type { CleanProgress, CleanReport, JunkGroupID } from "../mygo";
import { PillButton } from "../shell/PillButton";
import { strings } from "../strings";
import { type CleanLayer, CleanStrata } from "./CleanStrata";

type Layers = {
  layers: readonly CleanLayer[];
  progress: Partial<Record<JunkGroupID, CleanProgress>>;
};

/** Step 3: the selected junk groups emptied layer by layer, freed and trashed bytes counting up. */
export function CleaningView({
  layers,
  progress,
  active,
  freedBytes,
  trashedBytes,
}: Layers & { active: JunkGroupID | null; freedBytes: number; trashedBytes: number }) {
  return (
    <section
      aria-label={strings.clean.cleaning.label}
      role="status"
      className="flex w-full flex-1 flex-col justify-center gap-4"
    >
      <RemovedTotals
        freedBytes={freedBytes}
        trashedBytes={trashedBytes}
        freed={strings.clean.cleaning.freedSoFar}
        trashed={strings.clean.cleaning.trashedSoFar}
      />
      <CleanStrata layers={layers} progress={progress} active={active} />
    </section>
  );
}

/** Step 4: what Clean removed and what it skipped, with each skip's reason. */
export function DoneView({
  layers,
  progress,
  report,
  onFinish,
}: Layers & { report: CleanReport; onFinish: () => void }) {
  const skipped = report.items.filter((item) => item.skipReason !== null);
  return (
    <section
      aria-label={strings.clean.done.label}
      className="flex w-full flex-1 flex-col items-center justify-center gap-4"
    >
      <RemovedTotals
        freedBytes={report.freedBytes}
        trashedBytes={report.trashedBytes}
        freed={strings.clean.done.freed}
        trashed={strings.clean.done.trashed}
      />
      <CleanStrata layers={layers} progress={progress} active={null} />
      <p className="text-ink-muted text-note">
        {strings.clean.done.summary(report.items.length - skipped.length, skipped.length)}
      </p>
      {skipped.length > 0 && (
        <ul className="max-h-32 w-full overflow-y-auto rounded-card border border-line bg-surface px-4 py-2">
          {skipped.map((item) => (
            <li key={item.id} className="truncate py-0.5 font-mono text-caption text-ink-muted">
              {item.skipReason && strings.clean.done.skippedItem(item.path || item.id, item.skipReason)}
            </li>
          ))}
        </ul>
      )}
      <PillButton onClick={onFinish}>{strings.clean.done.finish}</PillButton>
    </section>
  );
}

/**
 * The totals above the Strata: the freed bytes as the big number, then the
 * bytes moved to Trash apart from them, since their space comes back only
 * once the Trash is emptied. The Trash line is absent until any moved.
 */
function RemovedTotals({
  freedBytes,
  trashedBytes,
  freed,
  trashed,
}: {
  freedBytes: number;
  trashedBytes: number;
  freed: (unit: string) => string;
  trashed: (size: string) => string;
}) {
  return (
    <div className="w-full">
      <FreedCounter bytes={freedBytes} unit={freed} />
      {trashedBytes > 0 && <p className="tabular text-ink-muted text-note">{trashed(formatBytes(trashedBytes))}</p>}
    </div>
  );
}

/** The big number: "1.2" with its unit and caption, e.g. "GB freed so far". */
function FreedCounter({ bytes, unit }: { bytes: number; unit: (unit: string) => string }) {
  const { value, unit: byteUnit } = bytesParts(bytes);
  return (
    <p className="tabular w-full font-bold text-metric">
      {value} <span className="text-ink-muted text-subhead">{unit(byteUnit)}</span>
    </p>
  );
}
