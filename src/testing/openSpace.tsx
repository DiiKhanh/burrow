import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { overview } from "./measures";
import { fakeGo } from "./mygo.fake";

export async function openSpace() {
  const user = userEvent.setup();
  render(<App />);
  await user.keyboard("{Meta>}3{/Meta}");
  return user;
}

/** Opens Space with its first overview Measure complete. */
export async function openOverview() {
  const user = await openSpace();
  await act(async () => fakeGo.measure.last.resolve(overview));
  return user;
}
