import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

function renderApp() {
  render(<App />);
  return userEvent.setup();
}

describe("App tabs", () => {
  it("opens on Clean", () => {
    renderApp();
    expect(screen.getByRole("tab", { name: "Clean" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel", { name: "Clean" })).toBeVisible();
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

  it("ignores 1 and 2 without ⌘ or with other modifiers", async () => {
    const user = renderApp();
    await user.keyboard("2");
    await user.keyboard("{Meta>}{Shift>}2{/Shift}{/Meta}");
    await user.keyboard("{Control>}2{/Control}");
    expect(screen.getByRole("tab", { name: "Clean" })).toHaveAttribute("aria-selected", "true");
  });
});
