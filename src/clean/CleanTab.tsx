import { Channel } from "mygo-runtime";
import { useRef, useState } from "react";
import { formatBytes } from "../format";
import { Clean, type JunkGroupID, type ScanProgress, type ScanResult } from "../mygo";
import { PillButton } from "../shell/PillButton";
import { strings } from "../strings";
import { Review } from "./Review";
import { ScanStrata } from "./ScanStrata";

export type ScanSession = { result: Promise<ScanResult>; cancel: () => void };
export type StartScan = (onProgress: (progress: ScanProgress) => void) => ScanSession;

const startRealScan: StartScan = (onProgress) => {
  const updates = new Channel<ScanProgress>(onProgress);
  return { result: Clean.scan(updates), cancel: () => updates.close() };
};

type Phase = "idle" | "scanning" | "review";

type Props = { startScan?: StartScan };

/** The Clean tab: Scan, Review, Clean and Done. */
export function CleanTab({ startScan = startRealScan }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [groupBytes, setGroupBytes] = useState<Partial<Record<JunkGroupID, number>>>({});
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState(false);
  const sessionRef = useRef<ScanSession | null>(null);
  const runRef = useRef(0);

  const begin = () => {
    const run = ++runRef.current;
    setPhase("scanning");
    setProgress(null);
    setGroupBytes({});
    setResult(null);
    setError(false);
    const session = startScan((next) => {
      if (runRef.current !== run) return;
      setProgress(next);
      if (next.groupBytes !== undefined) {
        setGroupBytes((current) => ({ ...current, [next.groupId]: next.groupBytes }));
      }
    });
    sessionRef.current = session;
    void session.result.then(
      (next) => {
        if (runRef.current !== run) return;
        setResult(next);
        setPhase("review");
        sessionRef.current = null;
      },
      () => {
        if (runRef.current !== run) return;
        setError(true);
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
    setProgress(null);
    setGroupBytes({});
  };

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-clean flex-1 flex-col items-center gap-6 px-6 pt-8 pb-16">
      <Stepper phase={phase} />
      {phase === "idle" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <h1 className="font-bold text-title">{strings.clean.idle.title}</h1>
          <p className="text-ink-muted text-note">{strings.clean.idle.description}</p>
          {error && <p className="text-body text-danger">{strings.clean.scanError}</p>}
          <PillButton onClick={begin}>{strings.clean.idle.action}</PillButton>
        </section>
      )}
      {phase === "scanning" && (
        <section
          aria-label={strings.clean.scanProgress}
          role="status"
          className="flex w-full flex-1 flex-col justify-center gap-4"
        >
          <p className="tabular font-bold text-metric">
            {strings.clean.foundSoFar(formatBytes(progress?.foundBytes ?? 0))}
          </p>
          <ScanStrata progress={progress} groupBytes={groupBytes} />
          <p className="h-5 truncate font-mono text-label text-ink-faint">
            {progress?.currentPath || strings.clean.preparing}
          </p>
          <button type="button" onClick={cancel} className="self-center text-button text-size hover:underline">
            {strings.clean.cancel}
          </button>
        </section>
      )}
      {phase === "review" && result && <Review result={result} onScanAgain={begin} />}
    </main>
  );
}

/** The step each phase belongs to: Scan, Review, Clean, Done. */
const STEP: Record<Phase, number> = { idle: 0, scanning: 0, review: 1 };

type StepState = "done" | "current" | "ahead";

const BADGE: Record<StepState, string> = {
  done: "bg-ok text-pill-ink",
  current: "bg-pill text-pill-ink",
  ahead: "border border-line-strong text-ink-faint",
};

function stepState(index: number, current: number): StepState {
  if (index < current) return "done";
  return index === current ? "current" : "ahead";
}

function Stepper({ phase }: { phase: Phase }) {
  const current = STEP[phase];
  return (
    <ol aria-label={strings.clean.steps.label} className="flex items-center gap-2 font-mono text-caption">
      {strings.clean.steps.items.map((step, index) => (
        <li key={step} aria-current={index === current ? "step" : undefined} className="flex items-center gap-2">
          <span className={`grid size-5 place-items-center rounded-full ${BADGE[stepState(index, current)]}`}>
            {index < current ? strings.clean.steps.done : index + 1}
          </span>
          <span className={index === current ? "text-ink" : "text-ink-faint"}>{step}</span>
          {index < strings.clean.steps.items.length - 1 && <span className="h-px w-8 bg-line-strong" />}
        </li>
      ))}
    </ol>
  );
}
