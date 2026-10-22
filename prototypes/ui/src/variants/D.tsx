// Variant D "Chosen": the user's pick. Clean from C with Strata for scan and clean, Status bento from A.
import type { VariantProps } from "./types";
import { PillTabs, Window } from "../shared/Shell";
import { CleanGuided } from "./C";
import { StatusBento } from "./A";

export const name = "Chosen: C Clean + A Status";

export function VariantD({ tab, setTab, flow, status }: VariantProps) {
  return (
    <Window tab={tab}>
      <header className="flex justify-center pt-12">
        <PillTabs tab={tab} onChange={setTab} />
      </header>
      {tab === "clean" ? <CleanGuided flow={flow} fixedScan="3" strataClean /> : <StatusBento s={status} />}
    </Window>
  );
}
