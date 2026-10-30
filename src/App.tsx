import { CleanTab } from "./clean/CleanTab";
import { Window } from "./shell/Window";
import { SpaceTab } from "./space/SpaceTab";
import { StatusTab } from "./status/StatusTab";

export function App() {
  return <Window panels={{ clean: <CleanTab />, status: <StatusTab />, space: <SpaceTab /> }} />;
}
