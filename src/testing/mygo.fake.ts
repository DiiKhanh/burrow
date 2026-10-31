// The stand-in for the generated client in src/mygo.ts, used by Vitest and by
// `vite --mode fake` for Playwright. `satisfies` keeps its shape in step with
// the Go services. Every call waits until a test settles it through `fakeGo`;
// in `--mode fake` the autopilot settles them by the page's URL scenario.
import type { GoEvent } from "mygo-runtime";
import type * as Real from "../mygo";
import { installAutopilot } from "./autopilot";

type ScanUpdates = Parameters<typeof Real.Clean.scan>[0];
type CleanUpdates = Parameters<typeof Real.Clean.clean>[1];
type MeasureUpdates = Parameters<typeof Real.Space.measure>[1];
type TrashUpdates = Parameters<typeof Real.Space.moveToTrash>[1];

/** A call to the fake that the test settles, as Go would. */
type Pending<T> = { resolve(value: T): void; reject(error?: Error): void };

/**
 * A call that streams progress through a channel. Closing the channel only
 * marks it cancelled: like Go, it still settles, and progress already on its
 * way still arrives, so tests can send both late.
 */
export type StreamCall<P, T> = Pending<T> & { emit(progress: P): void; readonly cancelled: boolean };

export type ScanCall = StreamCall<Real.ScanProgress, Real.ScanResult>;
export type CleanCall = StreamCall<Real.CleanProgress, Real.CleanReport> & { readonly ids: readonly string[] };
export type MeasureCall = StreamCall<Real.NoProgress, Real.MeasureResult> & { readonly target: Real.MeasureTarget };
export type TrashCall = StreamCall<Real.TrashProgress, Real.TrashReport> & { readonly ids: readonly string[] };
export type PrivacyCall = Pending<Real.SettingsPane>;
export type RevealCall = Pending<void> & { readonly id: string };
export type LockedCall = Pending<Real.LockedGroup[]>;

/** The calls one method of the fake received, oldest first. */
export type CallLog<C> = {
  readonly calls: readonly C[];
  /** The newest call; throws when there is none, so a test sees what it missed. */
  readonly last: C;
  /** Calls listener with every later call. */
  onCall(listener: (call: C) => void): void;
};

function callLog<C>(method: string) {
  let calls: readonly C[] = [];
  let listeners: readonly ((call: C) => void)[] = [];
  const log: CallLog<C> = {
    get calls() {
      return calls;
    },
    get last() {
      const call = calls.at(-1);
      if (!call) throw new Error(`fake: ${method} was not called`);
      return call;
    },
    onCall(listener) {
      listeners = [...listeners, listener];
    },
  };
  return {
    log,
    record(call: C) {
      calls = [...calls, call];
      for (const listener of listeners) listener(call);
    },
    reset() {
      calls = [];
      listeners = [];
    },
  };
}

function pending<T>(): { promise: Promise<T> } & Pending<T> {
  let settle: Pending<T> = { resolve: () => {}, reject: () => {} };
  const promise = new Promise<T>((resolve, reject) => {
    settle = { resolve, reject };
  });
  return {
    promise,
    resolve: (value) => settle.resolve(value),
    reject: (error = new Error("fake: rejected by the test")) => settle.reject(error),
  };
}

/** Callers add to the call with Object.assign: a spread would freeze `cancelled` at false. */
function streamCall<P, T>(updates: { onmessage: ((value: P) => void) | null; readonly closed: boolean }) {
  const settle = pending<T>();
  const call: StreamCall<P, T> = {
    resolve: settle.resolve,
    reject: settle.reject,
    emit: (progress) => updates.onmessage?.(progress),
    get cancelled() {
      return updates.closed;
    },
  };
  return { call, promise: settle.promise };
}

const scans = callLog<ScanCall>("Clean.scan");
const cleans = callLog<CleanCall>("Clean.clean");
const measures = callLog<MeasureCall>("Space.measure");
const trashes = callLog<TrashCall>("Space.moveToTrash");
const reveals = callLog<RevealCall>("Space.reveal");
const privacy = callLog<PrivacyCall>("Privacy.openFullDiskAccess");
const locks = callLog<LockedCall>("Clean.locked");

export const Clean = {
  clean: (ids: string[], updates: CleanUpdates): Promise<Real.CleanReport> => {
    const { call, promise } = streamCall<Real.CleanProgress, Real.CleanReport>(updates);
    cleans.record(Object.assign(call, { ids: [...ids] }));
    return promise;
  },
  locked: (): Promise<Real.LockedGroup[]> => {
    const { promise, ...call } = pending<Real.LockedGroup[]>();
    locks.record(call);
    return promise;
  },
  scan: (updates: ScanUpdates): Promise<Real.ScanResult> => {
    const { call, promise } = streamCall<Real.ScanProgress, Real.ScanResult>(updates);
    scans.record(call);
    return promise;
  },
} as const satisfies typeof Real.Clean;

export const Space = {
  measure: (target: Real.MeasureTarget, updates: MeasureUpdates): Promise<Real.MeasureResult> => {
    const { call, promise } = streamCall<Real.NoProgress, Real.MeasureResult>(updates);
    measures.record(Object.assign(call, { target: { ...target } }));
    return promise;
  },
  moveToTrash: (ids: string[], updates: TrashUpdates): Promise<Real.TrashReport> => {
    const { call, promise } = streamCall<Real.TrashProgress, Real.TrashReport>(updates);
    trashes.record(Object.assign(call, { ids: [...ids] }));
    return promise;
  },
  reveal: (id: string): Promise<void> => {
    const { promise, ...call } = pending<void>();
    reveals.record({ ...call, id });
    return promise;
  },
} as const satisfies typeof Real.Space;

export const Privacy = {
  openFullDiskAccess: (): Promise<Real.SettingsPane> => {
    const { promise, ...call } = pending<Real.SettingsPane>();
    privacy.record(call);
    return promise;
  },
} as const satisfies typeof Real.Privacy;

export const Status = {
  ping: async () => {},
} as const satisfies typeof Real.Status;

/** An event the test sends in place of Go. */
type FakeEvent<T> = GoEvent<T> & { emit(payload: T): void };

function fakeEvent<T>(name: string): FakeEvent<T> {
  const listeners = new Set<(payload: T) => void>();
  const on = (listener: (payload: T) => void) => {
    // Wrapped, so subscribing one function twice gives two subscriptions.
    const entry = (payload: T) => listener(payload);
    listeners.add(entry);
    return () => {
      listeners.delete(entry);
    };
  };
  return {
    name,
    on,
    once(listener) {
      const off = on((payload) => {
        off();
        listener(payload);
      });
      return off;
    },
    emit(payload) {
      for (const listener of [...listeners]) listener(payload);
    },
  };
}

export const events = {
  status: fakeEvent<Real.Snapshot>("status"),
} as const satisfies typeof Real.events;

/** What tests drive in place of Go: Vitest imports it, Playwright reaches it through `window.burrowFake`. */
export const fakeGo = {
  scan: scans.log,
  clean: cleans.log,
  locked: locks.log,
  measure: measures.log,
  moveToTrash: trashes.log,
  reveal: reveals.log,
  privacy: privacy.log,
  status: { emit: (snapshot: Real.Snapshot) => events.status.emit(snapshot) },
};

export type FakeGo = typeof fakeGo;

/** Forgets every call and call listener, so each test starts from none. */
export function resetFake() {
  scans.reset();
  cleans.reset();
  locks.reset();
  measures.reset();
  trashes.reset();
  reveals.reset();
  privacy.reset();
}

declare global {
  interface Window {
    burrowFake?: FakeGo;
  }
}

if (typeof window !== "undefined") window.burrowFake = fakeGo;
if (import.meta.env.MODE === "fake") installAutopilot(fakeGo, location.search);
