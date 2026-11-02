import { Channel } from "mygo-runtime";
import { useState } from "react";
import { Space, type SpaceItem, type TrashProgress, type TrashReport } from "../mygo";
import { strings } from "../strings";
import type { Picker } from "./ItemSection";
import { listedItems, type Picks, pickedItems, pickState, setPicked } from "./picks";
import type { Measures } from "./useMeasures";

export type Trash = {
  picker: Picker;
  /** The picked Space items, each as last measured. */
  picked: readonly SpaceItem[];
  moving: boolean;
  progress: TrashProgress | null;
  report: TrashReport | null;
  error: string | null;
  move: () => void;
  dismiss: () => void;
};

/**
 * What is picked and the Move to Trash that takes it. A run takes the picks
 * of the moment it starts, so a pick made meanwhile waits for the next one.
 */
export function useTrash({ results, forget }: Pick<Measures, "results" | "forget">): Trash {
  const [picks, setPicks] = useState<Picks>(new Set());
  const [moving, setMoving] = useState(false);
  const [progress, setProgress] = useState<TrashProgress | null>(null);
  const [report, setReport] = useState<TrashReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listed = listedItems(results.values());
  const picked = pickedItems(picks, listed);

  const move = () => {
    const ids = picked.map((item) => item.id);
    setMoving(true);
    setProgress(null);
    setReport(null);
    setError(null);
    void Space.moveToTrash(ids, new Channel<TrashProgress>(setProgress)).then(
      (next) => {
        // An item already gone left the disk too; only the bytes moved count as moved.
        forget(next.items.filter(({ skipReason }) => skipReason === null || skipReason === "already_gone"));
        setPicks((current) => new Set([...current].filter((id) => !ids.includes(id))));
        setReport(next);
        setMoving(false);
      },
      () => {
        setError(strings.space.trash.error);
        setMoving(false);
      },
    );
  };

  return {
    picker: {
      stateOf: (item) => pickState(item, picked),
      onPick: (item, on) => {
        setReport(null);
        setPicks((current) => setPicked(current, item, on, listed));
      },
    },
    picked,
    moving,
    progress,
    report,
    error,
    move,
    dismiss: () => setReport(null),
  };
}
