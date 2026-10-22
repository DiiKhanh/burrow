// The scripted stand-in for the generated client in src/mygo.ts, used by
// Vitest and by `vite --mode fake` for Playwright. `satisfies` keeps its
// shape in step with the Go services.
import type { GoEvent } from "mygo-runtime";
import type * as Real from "../mygo";

export const Clean = {
  ping: async () => {},
} as const satisfies typeof Real.Clean;

export const Status = {
  ping: async () => {},
} as const satisfies typeof Real.Status;

/** An event the test sends in place of Go. */
export type FakeEvent<T> = GoEvent<T> & { emit(payload: T): void };

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

/** What Playwright drives through `window.burrowFake` in `--mode fake`. */
export type FakeGo = { emitStatus(snapshot: Real.Snapshot): void };

declare global {
  interface Window {
    burrowFake?: FakeGo;
  }
}

if (typeof window !== "undefined") {
  window.burrowFake = { emitStatus: (snapshot) => events.status.emit(snapshot) };
}
