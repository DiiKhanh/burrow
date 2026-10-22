import { describe, expect, it } from "vitest";
import { formatBytes, formatSpeed } from "./format";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [999, "999 B"],
    [1_000, "1 KB"],
    [1_234_567, "1.23 MB"],
    [860_000_000, "860 MB"],
    [12_600_000_000, "12.6 GB"],
    [12_649_999_999, "12.6 GB"],
    [12_650_000_000, "12.7 GB"],
    [154_000_000_000, "154 GB"],
    [2_000_000_000_000, "2 TB"],
  ])("formats %d bytes as %s, in decimal units like Finder", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it("moves to the next unit when rounding reaches 1000", () => {
    expect(formatBytes(999_500)).toBe("1 MB");
    expect(formatBytes(999_499)).toBe("999 KB");
  });

  it("formats very large sizes", () => {
    expect(formatBytes(Number.MAX_SAFE_INTEGER)).toBe("9.01 PB");
    expect(formatBytes(3.2e18)).toBe("3.2 EB");
    expect(formatBytes(1.234e21)).toBe("1,230 EB");
  });

  it("rounds fractional bytes", () => {
    expect(formatBytes(512.6)).toBe("513 B");
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, -1])("shows %s as a dash", (bytes) => {
    expect(formatBytes(bytes)).toBe("-");
  });
});

describe("formatSpeed", () => {
  it.each([
    [0, "0 KB/s"],
    [300, "0.3 KB/s"],
    [1_500, "1.5 KB/s"],
    [999_999, "1 MB/s"],
    [45_300_000, "45.3 MB/s"],
    [2_100_000_000, "2.1 GB/s"],
  ])("formats %d bytes per second as %s", (bytesPerSecond, expected) => {
    expect(formatSpeed(bytesPerSecond)).toBe(expected);
  });

  it.each([null, Number.NaN, -5])("shows %s as a dash", (bytesPerSecond) => {
    expect(formatSpeed(bytesPerSecond)).toBe("-");
  });
});
