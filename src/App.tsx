import { CleanTab } from "./clean/CleanTab";
import { Window } from "./shell/Window";
import { StatusTab } from "./status/StatusTab";

export function App() {
  return <Window panels={{ clean: <CleanTab />, status: <StatusTab /> }} />;
}
