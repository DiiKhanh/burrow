import { Channel } from "mygo-runtime";
import { useRef, useState } from "react";
import { formatBytes } from "../format";
import { Clean, type JunkGroupID, type ScanProgress, type ScanResult } from "../mygo";
import { strings } from "../strings";
import { junkGroupCatalog } from "./catalog";
import { ScanStrata } from "./ScanStrata";

export type ScanSession = { result: Promise<ScanResult>; cancel: () => void };
export type StartScan = (onProgress: (progress: ScanProgress) => void) => ScanSession;

const startRealScan: StartScan = (onProgress) => {
  const updates = new Channel<ScanProgress>(onProgress);
  return { result: Clean.scan(updates), cancel: () => updates.close() };
};

type Phase = "idle" | "scanning" | "result";

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
        setPhase("result");
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
    <main className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center gap-6 px-6 pt-8 pb-16">
      <Stepper phase={phase} />
      {phase === "idle" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <h1 className="font-bold text-metric">{strings.clean.idle.title}</h1>
          <p className="max-w-xl text-body text-ink-muted">{strings.clean.idle.description}</p>
          {error && <p className="text-body text-danger">{strings.clean.scanError}</p>}
          <button
            type="button"
            onClick={begin}
            className="rounded-full bg-pill px-5 py-2 font-semibold text-button text-pill-ink"
          >
            {strings.clean.idle.action}
          </button>
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
      {phase === "result" && result && (
        <section className="flex w-full flex-1 flex-col justify-center gap-4">
          <p className="tabular font-bold text-metric">{strings.clean.found(formatBytes(totalBytes(result)))}</p>
          <ul
            aria-label={strings.clean.scanResults}
            className="w-full divide-y divide-line overflow-hidden rounded-card border border-line bg-surface"
          >
            {result.groups.map((group) => (
              <li key={group.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-body text-ink">{junkGroupCatalog[group.id].name}</p>
                  <p className="truncate text-label text-ink-faint">{junkGroupCatalog[group.id].description}</p>
                </div>
                <span className="tabular font-mono text-body text-size">
                  {formatBytes(group.items.reduce((sum, item) => sum + item.bytes, 0))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Stepper({ phase }: { phase: Phase }) {
  const active = phase === "idle" || phase === "scanning" ? 0 : 1;
  return (
    <ol aria-label={strings.clean.steps.label} className="flex items-center gap-2 font-mono text-label">
      {strings.clean.steps.items.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          <span
            className={`grid size-5 place-items-center rounded-full ${index === active ? "bg-pill text-pill-ink" : "border border-line-strong text-ink-faint"}`}
          >
            {index + 1}
          </span>
          <span className={index === active ? "text-ink" : "text-ink-faint"}>{step}</span>
          {index < strings.clean.steps.items.length - 1 && <span className="h-px w-8 bg-line-strong" />}
        </li>
      ))}
    </ol>
  );
}

function totalBytes(result: ScanResult): number {
  return result.groups.reduce((total, group) => total + group.items.reduce((sum, item) => sum + item.bytes, 0), 0);
}
