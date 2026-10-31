import { useState } from "react";
import { CleanTab } from "./clean/CleanTab";
import { Window } from "./shell/Window";
import { SpaceTab } from "./space/SpaceTab";
import { StatusTab } from "./status/StatusTab";

export function App() {
  const [lastCleanAt, setLastCleanAt] = useState<number | null>(null);
  return (
    <Window
      panels={{
        clean: <CleanTab onCleanEnded={() => setLastCleanAt(Date.now())} />,
        status: <StatusTab />,
        space: <SpaceTab lastCleanAt={lastCleanAt} />,
      }}
    />
  );
}
