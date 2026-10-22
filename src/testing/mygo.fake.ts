// The scripted stand-in for the generated client in src/mygo.ts, used by
// Vitest and by `vite --mode fake` for Playwright. `satisfies` keeps its
// shape in step with the Go services.
import type * as Real from "../mygo";

export const Clean = {
  ping: async () => {},
} as const satisfies typeof Real.Clean;

export const Status = {
  ping: async () => {},
} as const satisfies typeof Real.Status;
