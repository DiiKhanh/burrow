import { formatBytes } from "../format";
import type { TrashProgress, TrashReport } from "../mygo";
import { PillButton } from "../shell/PillButton";
import { strings } from "../strings";
import type { Trash } from "./useTrash";

/** Under the list, whatever it scrolls to: the picks and the one action, or how the last run went. */
export function TrashFooter({ trash }: { trash: Trash }) {
  const { picked, moving, progress, report, error, move, dismiss } = trash;
  if (!moving && !report && !error && picked.length === 0) return null;
  const total = picked.reduce((sum, item) => sum + item.bytes, 0);
  return (
    <footer className="shrink-0 border-line border-t bg-surface-sunken">
      <div className="mx-auto flex w-full max-w-clean flex-col gap-2 px-6 py-3">
        {error && <p className="text-body text-danger">{error}</p>}
        {moving && <Moving progress={progress} />}
        {!moving && report && <Result report={report} onDone={dismiss} />}
        {!moving && picked.length > 0 && (
          <div className="flex items-center justify-between gap-4">
            <p className="tabular min-w-0 font-mono text-note text-size">
              {strings.space.trash.picked(formatBytes(total))}
            </p>
            <PillButton onClick={move}>{strings.space.trash.move(picked.length, formatBytes(total))}</PillButton>
          </div>
        )}
      </div>
    </footer>
  );
}

/** How far a run got; before its first progress, nothing yet. */
function Moving({ progress }: { progress: TrashProgress | null }) {
  const { processed = 0, total = 0, movedBytes = 0 } = progress ?? {};
  const { count, label, movedSoFar } = strings.space.trash.progress;
  return (
    <section aria-label={label} role="status" className="flex flex-col gap-2 py-2">
      <p className="flex items-baseline justify-between gap-4 text-ink-muted text-note">
        <span className="tabular">{count(processed, total)}</span>
        <span className="tabular font-mono text-caption text-size">{movedSoFar(formatBytes(movedBytes))}</span>
      </p>
      <progress aria-label={label} value={processed} max={total} className="meter-progress h-1.5 w-full text-size" />
    </section>
  );
}

function Result({ report, onDone }: { report: TrashReport; onDone: () => void }) {
  const { label, summary, emptyTrash, done } = strings.space.trash.result;
  const skipped = report.items.flatMap(({ name, id, skipReason }) =>
    skipReason ? [{ name: name || id, reason: skipReason }] : [],
  );
  const moved = report.items.length - skipped.length;
  return (
    <section aria-label={label} className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p role="status" className="tabular max-h-16 overflow-y-auto break-words text-note">
          {summary(formatBytes(report.movedBytes), moved, skipped)}
        </p>
        {moved > 0 && <p className="text-caption text-ink-muted">{emptyTrash}</p>}
      </div>
      <button type="button" onClick={onDone} className="shrink-0 text-button text-size hover:underline">
        {done}
      </button>
    </section>
  );
}
