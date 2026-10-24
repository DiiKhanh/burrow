import { CleanTab } from "./clean/CleanTab";
import { Window } from "./shell/Window";
import { SpacePrototype } from "./space-prototype/SpacePrototype";
import { StatusTab } from "./status/StatusTab";

export function App() {
  return <Window panels={{ clean: <CleanTab />, status: <StatusTab />, space: <SpacePrototype /> }} />;
}
