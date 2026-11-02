import { Channel } from "mygo-runtime";
import { useRef, useState } from "react";
import { type MeasureResult, type MeasureTarget, type NoProgress, Space, type SpaceItem } from "../mygo";
import { strings } from "../strings";
import { type Gone, isGone, keyOf, withoutGone } from "./results";

type MeasureSession = { result: Promise<MeasureResult>; cancel: () => void };

/** Starts a Measure; cancel closes its channel, which stops it in Go. */
function startMeasure(target: MeasureTarget): MeasureSession {
  const updates = new Channel<NoProgress>();
  return { result: Space.measure(target, updates), cancel: () => updates.close() };
}

/** One step of the breadcrumb: a name and the target it shows. */
export type Crumb = { name: string; target: MeasureTarget };

/** From "This Mac" to the folder on screen; never empty. */
export type Trail = readonly [Crumb, ...Crumb[]];

export function lastCrumb(trail: Trail): Crumb {
  return trail[trail.length - 1] ?? trail[0];
}

function upTo(trail: Trail, index: number): Trail {
  return [trail[0], ...trail.slice(1, index + 1)];
}

/** The trail as far as its folders are left. */
function withoutGoneFolders(trail: Trail, gone: readonly Gone[]): Trail {
  const first = trail.findIndex((crumb) => isGone(crumb.target, gone));
  return first < 0 ? trail : upTo(trail, first - 1);
}

const ROOT: Crumb = { name: strings.space.trail.root, target: { kind: "overview" } };

export type Measures = {
  trail: Trail;
  /** The last Measure of the folder on screen, kept for the session. */
  result: MeasureResult | null;
  /** The last Measure of every target this session, by keyOf. */
  results: ReadonlyMap<string, MeasureResult>;
  measuring: boolean;
  error: string | null;
  open: (item: SpaceItem) => void;
  /** Goes back up to the crumb at index. */
  goTo: (index: number) => void;
  measureAgain: () => void;
  cancel: () => void;
  /** Takes items no longer on disk out of every result and the trail, without a new Measure. */
  forget: (gone: readonly Gone[]) => void;
};

/**
 * Space's navigation: the trail of opened folders and every result measured
 * this session, in memory only, so going back up or reopening a folder is
 * instant. At most one Measure runs; starting another cancels it.
 */
export function useMeasures(): Measures {
  const [trail, setTrail] = useState<Trail>([ROOT]);
  const [results, setResults] = useState<ReadonlyMap<string, MeasureResult>>(new Map());
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<MeasureSession | null>(null);

  const stop = () => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setMeasuring(false);
  };

  const measure = (target: MeasureTarget) => {
    stop();
    setError(null);
    setMeasuring(true);
    const session = startMeasure(target);
    sessionRef.current = session;
    void session.result.then(
      (next) => {
        if (sessionRef.current !== session) return;
        sessionRef.current = null;
        setResults((known) => new Map(known).set(keyOf(target), next));
        setMeasuring(false);
      },
      () => {
        // A cancelled or superseded run rejects for its cancel: nothing went wrong.
        if (sessionRef.current !== session) return;
        sessionRef.current = null;
        setError(strings.space.error);
        setMeasuring(false);
      },
    );
  };

  /** Shows the trail's last crumb, measuring it only if this session has not yet. */
  const show = (next: Trail) => {
    stop();
    setError(null);
    setTrail(next);
    const { target } = lastCrumb(next);
    if (!results.has(keyOf(target))) measure(target);
  };

  const current = lastCrumb(trail);
  return {
    trail,
    result: results.get(keyOf(current.target)) ?? null,
    results,
    measuring,
    error,
    open: (item) => {
      if (item.opens) show([...trail, { name: item.name, target: item.opens }]);
    },
    goTo: (index) => show(upTo(trail, index)),
    measureAgain: () => measure(current.target),
    // Back to the deepest crumb with a result: a folder never measured has nothing to show.
    cancel: () => {
      stop();
      const measured = trail.reduce((deepest, crumb, index) => (results.has(keyOf(crumb.target)) ? index : deepest), 0);
      setTrail(upTo(trail, measured));
    },
    forget: (gone) => {
      setResults((known) => withoutGone(known, gone));
      setTrail((known) => withoutGoneFolders(known, gone));
    },
  };
}
