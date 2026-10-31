import { useEffect, useRef } from "react";
import type { MeasureTarget } from "../mygo";
import { useTabActive } from "../shell/activeTab";
import { Notice } from "../shell/Notice";
import { PillButton } from "../shell/PillButton";
import { strings } from "../strings";
import { Folder } from "./Folder";
import { Overview } from "./Overview";
import { TrashFooter } from "./TrashFooter";
import { lastCrumb, type Measures, type Trail, useMeasures } from "./useMeasures";
import { useTrash } from "./useTrash";

/**
 * The Space tab: the overview of the whole Mac, measured the first time the
 * tab opens, and every folder opened from it. Results stay while other tabs
 * show, since every tab stays mounted, as do the picks, which the footer
 * moves to the Trash. A result measured before the last Clean ended, at
 * lastCleanAt, says so and stays until measured again.
 */
export function SpaceTab({ lastCleanAt }: { lastCleanAt: number | null }) {
  const active = useTabActive();
  const measures = useMeasures();
  const trash = useTrash(measures);
  const openedRef = useRef(false);
  const { trail, result, measuring, error } = measures;
  const { name, target } = lastCrumb(trail);

  // Space measures nothing in the background: only once the user opens it.
  useEffect(() => {
    if (!active || openedRef.current) return;
    openedRef.current = true;
    measures.measureAgain();
  }, [active]);

  // Before the overview's first result, the tab has nowhere to go back to.
  const started = trail.length > 1 || result !== null;
  const stale = result !== null && lastCleanAt !== null && Date.parse(result.measuredAt) < lastCleanAt;
  const notice = stale && (
    <Notice label={strings.space.stale} action={strings.space.measureAgain} onAction={measures.measureAgain}>
      {strings.space.stale}
    </Notice>
  );
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-clean flex-col gap-6 px-6 pt-8 pb-16">
          {!started && !measuring && (
            <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
              <h1 className="font-bold text-title">{strings.space.idle.title}</h1>
              <p className="text-ink-muted text-note">{strings.space.idle.description}</p>
              {error && <p className="text-body text-danger">{error}</p>}
              <PillButton onClick={measures.measureAgain}>{strings.space.idle.action}</PillButton>
            </section>
          )}
          {started && <Header measures={measures} />}
          {started && error && <p className="text-body text-danger">{error}</p>}
          {measuring && <Measuring target={target} onCancel={measures.cancel} />}
          {!measuring &&
            result &&
            (target.kind === "overview" ? (
              <Overview result={result} notice={notice} onOpen={measures.open} picker={trash.picker} />
            ) : (
              <Folder name={name} result={result} notice={notice} onOpen={measures.open} picker={trash.picker} />
            ))}
        </div>
      </div>
      <TrashFooter trash={trash} />
    </main>
  );
}

/** The trail back up, and Measure again for the folder on screen. */
function Header({ measures }: { measures: Measures }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Breadcrumb trail={measures.trail} onGoTo={measures.goTo} />
      {!measures.measuring && (
        <button
          type="button"
          onClick={measures.measureAgain}
          className="shrink-0 text-caption text-ink-muted hover:text-ink"
        >
          {strings.space.measureAgain}
        </button>
      )}
    </div>
  );
}

function Breadcrumb({ trail, onGoTo }: { trail: Trail; onGoTo: (index: number) => void }) {
  const last = trail.length - 1;
  return (
    <nav aria-label={strings.space.trail.label} className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-caption text-ink-muted">
        {trail.map((crumb, index) => (
          // Each crumb lies inside the one before, so no target repeats.
          <li key={JSON.stringify(crumb.target)} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden="true" className="text-ink-faint">
                {strings.space.trail.separator}
              </span>
            )}
            <button
              type="button"
              aria-current={index === last ? "page" : undefined}
              onClick={() => onGoTo(index)}
              className={`max-w-60 truncate ${index === last ? "text-ink" : "hover:text-ink"}`}
            >
              {crumb.name}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Indeterminate: a Measure reports no progress, only its result. */
function Measuring({ target, onCancel }: { target: MeasureTarget; onCancel: () => void }) {
  const overview = target.kind === "overview";
  return (
    <section
      aria-label={strings.space.measuring.label}
      role="status"
      className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
    >
      <p className="font-bold text-title">{strings.space.measuring.title}</p>
      <p className="max-w-full break-all font-mono text-caption text-ink-muted">
        {overview ? strings.space.measuring.overview : target.path}
      </p>
      <progress aria-label={strings.space.measuring.title} className="scan-layer-progress h-1.5 w-72 rounded-full" />
      {overview && <p className="text-caption text-ink-faint">{strings.space.measuring.hint}</p>}
      <button type="button" onClick={onCancel} className="text-button text-size hover:underline">
        {strings.space.measuring.cancel}
      </button>
    </section>
  );
}
