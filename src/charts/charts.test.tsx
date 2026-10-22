import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarSpark } from "./BarSpark";
import { Sparkline } from "./Sparkline";

function bars(container: HTMLElement) {
  return [...container.querySelectorAll("rect")].map((rect) => ({
    x: Number(rect.getAttribute("x")),
    height: Number(rect.getAttribute("height")),
  }));
}

describe("BarSpark", () => {
  it("draws a bar per sample, scaled to the maximum", () => {
    const { container } = render(<BarSpark data={[25, 50, 100]} max={100} slots={3} />);
    expect(bars(container).map((bar) => bar.height)).toEqual([10, 20, 40]);
  });

  it("draws the newest sample at the right edge while the history fills up", () => {
    const { container } = render(<BarSpark data={[50, 50]} max={100} slots={60} />);
    const [older, newer] = bars(container);
    expect(newer?.x).toBe(236);
    expect(older?.x).toBe(232);
  });

  it("leaves a gap for a missing sample", () => {
    const { container } = render(<BarSpark data={[50, null, 50]} max={100} slots={3} />);
    expect(bars(container)).toHaveLength(2);
  });

  it("keeps a sliver for an idle sample and caps values above the maximum", () => {
    const { container } = render(<BarSpark data={[0, 250]} max={100} slots={2} />);
    expect(bars(container).map((bar) => bar.height)).toEqual([1.5, 40]);
  });

  it("is hidden from assistive technology", () => {
    const { container } = render(<BarSpark data={[1]} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Sparkline", () => {
  function path(container: HTMLElement) {
    return container.querySelector("path")?.getAttribute("d");
  }

  it("draws a line through the samples, newest at the right edge", () => {
    const { container } = render(<Sparkline data={[0, 100]} max={100} slots={2} />);
    expect(path(container)).toBe("M0,39L240,1");
  });

  it("starts a new stroke after a missing sample", () => {
    const { container } = render(<Sparkline data={[0, null, 0, 100]} max={100} slots={4} />);
    expect(path(container)).toBe("M0,39M160,39L240,1");
  });

  it("scales to the largest sample when no maximum is given", () => {
    const { container } = render(<Sparkline data={[5, 10]} slots={2} />);
    expect(path(container)).toBe("M0,20L240,1");
  });

  it("draws nothing without samples", () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(path(container)).toBe("");
  });
});
