import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { overview } from "../testing/measures";
import { fakeGo } from "../testing/mygo.fake";

async function openSpace() {
  const user = userEvent.setup();
  render(<App />);
  await user.keyboard("{Meta>}3{/Meta}");
  return user;
}

describe("Space Measure", () => {
  it("measures nothing until Space opens", () => {
    render(<App />);
    expect(fakeGo.measure.calls).toHaveLength(0);
  });

  it("measures the overview once Space opens, showing what it measures", async () => {
    await openSpace();

    expect(fakeGo.measure.last.target).toEqual({ kind: "overview" });
    const progress = screen.getByRole("status", { name: "Measure progress" });
    expect(within(progress).getByText("Measuring…")).toBeVisible();
    expect(within(progress).getByText("Applications, Library, your home folder and insights")).toBeVisible();
    expect(within(progress).getByRole("progressbar")).not.toHaveAttribute("value");
  });

  it("cancels the Measure by closing its channel and ignores its late result", async () => {
    const user = await openSpace();
    const measure = fakeGo.measure.last;

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(measure.cancelled).toBe(true);
    expect(screen.getByRole("button", { name: "Measure this Mac" })).toBeVisible();

    await act(async () => measure.resolve(overview));
    expect(screen.queryByRole("region", { name: "Locations" })).not.toBeInTheDocument();
  });

  it("measures again from the cancelled state", async () => {
    const user = await openSpace();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Measure this Mac" }));

    expect(fakeGo.measure.calls).toHaveLength(2);
    expect(screen.getByRole("status", { name: "Measure progress" })).toBeVisible();
  });

  it("says the Measure failed and offers to try again", async () => {
    const user = await openSpace();

    await act(async () => fakeGo.measure.last.reject());
    expect(screen.getByText("Measure could not finish. Try again.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Measure this Mac" }));
    expect(fakeGo.measure.calls).toHaveLength(2);
  });
});

describe("Space overview", () => {
  it("shows the total of the locations, Insights above them", async () => {
    await openSpace();
    await act(async () => fakeGo.measure.last.resolve(overview));

    expect(screen.getByText("146")).toBeVisible();
    expect(screen.getByText("GB measured on this Mac")).toBeVisible();
    expect(screen.getAllByRole("region")).toEqual([
      screen.getByRole("region", { name: "Insights" }),
      screen.getByRole("region", { name: "Locations" }),
    ]);
  });

  it("lists every Insight and location with its size, largest first", async () => {
    await openSpace();
    await act(async () => fakeGo.measure.last.resolve(overview));

    const rows = (name: string) =>
      within(screen.getByRole("region", { name }))
        .getAllByRole("listitem")
        .map((row) => row.textContent);
    expect(rows("Insights")).toEqual([
      "Docker Data21.6 GB",
      "Xcode Simulators3.07 GB",
      "Old Downloads (90d+)3.02 GB",
      "Homebrew Cache181 MB",
      "System Logs2.1 MB",
    ]);
    expect(rows("Locations")).toEqual([
      "User Library73.1 GB",
      "Home46.4 GB",
      "Applications19.7 GB",
      "System Library6.83 GB",
    ]);
  });

  it("keeps the overview when switching tabs, without measuring again", async () => {
    const user = await openSpace();
    await act(async () => fakeGo.measure.last.resolve(overview));

    await user.keyboard("{Meta>}1{/Meta}");
    await user.keyboard("{Meta>}3{/Meta}");

    expect(screen.getByRole("region", { name: "Locations" })).toBeVisible();
    expect(fakeGo.measure.calls).toHaveLength(1);
  });
});
