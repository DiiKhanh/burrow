import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { fakeGo } from "./testing/mygo.fake";
import { snapshot } from "./testing/snapshots";

function renderApp() {
  render(<App />);
  return userEvent.setup();
}

describe("App tabs", () => {
  it("opens on Clean", () => {
    renderApp();
    expect(screen.getByRole("tab", { name: "Clean" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Space" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel", { name: "Clean" })).toBeVisible();
    // Status and Space stay mounted to hold their results, but only one panel shows.
    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(panels).toHaveLength(3);
    expect(panels.filter((panel) => !panel.hidden)).toEqual([screen.getByRole("tabpanel", { name: "Clean" })]);
    expect(panels[1]).not.toBeVisible();
    expect(panels[2]).not.toBeVisible();
  });

  it("switches tabs on click", async () => {
    const user = renderApp();
    await user.click(screen.getByRole("tab", { name: "Status" }));
    expect(screen.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Status" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Clean" }));
    expect(screen.getByRole("tabpanel", { name: "Clean" })).toBeVisible();
  });

  it("switches tabs with ⌘1 and ⌘2", async () => {
    const user = renderApp();
    await user.keyboard("{Meta>}2{/Meta}");
    expect(screen.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Meta>}1{/Meta}");
    expect(screen.getByRole("tab", { name: "Clean" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens Space with ⌘3", async () => {
    const user = renderApp();
    await user.keyboard("{Meta>}3{/Meta}");
    expect(screen.getByRole("tab", { name: "Space" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Space" })).toBeVisible();
  });

  it("ignores 1 and 2 without ⌘ or with other modifiers", async () => {
    const user = renderApp();
    await user.keyboard("2");
    await user.keyboard("{Meta>}{Shift>}2{/Shift}{/Meta}");
    await user.keyboard("{Control>}2{/Control}");
    expect(screen.getByRole("tab", { name: "Clean" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("App status", () => {
  it("has the latest snapshot ready when Status opens", async () => {
    const user = renderApp();
    act(() => fakeGo.status.emit(snapshot({ cpu: { usage: 42 } })));

    await user.click(screen.getByRole("tab", { name: "Status" }));
    const cpu = within(screen.getByRole("region", { name: "CPU" }));
    expect(cpu.getByText("42")).toBeVisible();
    expect(screen.getByRole("region", { name: "CPU" }).querySelectorAll("rect")).toHaveLength(60);
  });
});
