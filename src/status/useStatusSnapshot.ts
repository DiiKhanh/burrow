import { useEffect, useState } from "react";
import { events, type Snapshot, Status } from "../mygo";

export function useStatusSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    const off = events.status.on((next) => {
      current = false;
      setSnapshot(next);
      setFailed(false);
    });
    Status.latest().then(
      (next) => {
        if (current && next) setSnapshot(next);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
      off();
    };
  }, []);
  return { snapshot, failed };
}
