import { Channel } from "mygo-runtime";
import { useEffect, useRef, useState } from "react";
import { type MeasureResult, type MeasureTarget, type NoProgress, Space } from "../mygo";
import { useTabActive } from "../shell/activeTab";
import { PillButton } from "../shell/PillButton";
import { strings } from "../strings";
import { Overview } from "./Overview";

type MeasureSession = { result: Promise<MeasureResult>; cancel: () => void };

/** Starts a Measure; cancel closes its channel, which stops it in Go. */
function startMeasure(target: MeasureTarget): MeasureSession {
  const updates = new Channel<NoProgress>();
  return { result: Space.measure(target, updates), cancel: () => updates.close() };
}

const OVERVIEW: MeasureTarget = { kind: "overview" };

type Phase = "idle" | "measuring" | "done";

/**
 * The Space tab: the overview of the whole Mac, measured the first time the
 * tab opens. The result stays while other tabs show, since every tab stays
 * mounted.
 */
export function SpaceTab() {
  const active = useTabActive();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<MeasureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<MeasureSession | null>(null);
  const runRef = useRef(0);
  const openedRef = useRef(false);

  const begin = () => {
    const run = ++runRef.current;
    setPhase("measuring");
    setError(null);
    const session = startMeasure(OVERVIEW);
    sessionRef.current = session;
    void session.result.then(
      (next) => {
        if (runRef.current !== run) return;
        setResult(next);
        setPhase("done");
        sessionRef.current = null;
      },
      () => {
        // A cancelled or superseded run rejects for its cancel: nothing went wrong.
        if (runRef.current !== run) return;
        setError(strings.space.error);
        setPhase("idle");
        sessionRef.current = null;
      },
    );
  };

  const cancel = () => {
    runRef.current++;
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setPhase("idle");
  };

  // Space measures nothing in the background: only once the user opens it.
  useEffect(() => {
    if (!active || openedRef.current) return;
    openedRef.current = true;
    begin();
  }, [active]);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-clean flex-1 flex-col gap-6 px-6 pt-8 pb-16">
        {phase === "idle" && (
          <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <h1 className="font-bold text-title">{strings.space.idle.title}</h1>
            <p className="text-ink-muted text-note">{strings.space.idle.description}</p>
            {error && <p className="text-body text-danger">{error}</p>}
            <PillButton onClick={begin}>{strings.space.idle.action}</PillButton>
          </section>
        )}
        {phase === "measuring" && <Measuring onCancel={cancel} />}
        {phase === "done" && result && <Overview result={result} />}
      </div>
    </main>
  );
}

/** Indeterminate: a Measure reports no progress, only its result. */
function Measuring({ onCancel }: { onCancel: () => void }) {
  return (
    <section
      aria-label={strings.space.measuring.label}
      role="status"
      className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
    >
      <p className="font-bold text-title">{strings.space.measuring.title}</p>
      <p className="font-mono text-caption text-ink-muted">{strings.space.measuring.overview}</p>
      <progress aria-label={strings.space.measuring.title} className="scan-layer-progress h-1.5 w-72 rounded-full" />
      <p className="text-caption text-ink-faint">{strings.space.measuring.hint}</p>
      <button type="button" onClick={onCancel} className="text-button text-size hover:underline">
        {strings.space.measuring.cancel}
      </button>
    </section>
  );
}
