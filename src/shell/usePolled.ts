import { useEffect, useState } from "react";

/** How long a page waits between asking Go the same thing. */
const POLL_MS = 1_000;

/**
 * What ask answers, starting from initial and asked at once and then every
 * second while active, so the page follows a change no event reports, such as
 * an app quitting. ask is a bound service method that logs in Go when it
 * rejects: the last answer stands.
 */
export function usePolled<T>(initial: T, ask: () => Promise<T>, active = true): T {
  const [answer, setAnswer] = useState(initial);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      ask()
        .then(
          (next) => {
            if (!stopped) setAnswer(next);
          },
          // Go logged it. The engine still skips what is locked as in use.
          () => {},
        )
        .finally(() => {
          if (!stopped) timer = setTimeout(poll, POLL_MS);
        });
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ask, active]);

  return answer;
}
