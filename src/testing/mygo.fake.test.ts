// Tests and `vite --mode fake` must get the fake wherever the app imports the
// generated client: the real one rejects outside MyGo.
import { Channel } from "mygo-runtime";
import { describe, expect, it } from "vitest";
import { Clean, type ScanProgress, Status } from "../mygo";
import { fakeGo } from "./mygo.fake";

describe("the MyGo client under test", () => {
  it("is the fake", async () => {
    await expect(Status.ping()).resolves.toBeUndefined();
  });

  it("hands each call to the test to settle", async () => {
    const updates = new Channel<ScanProgress>();
    const result = Clean.scan(updates);

    fakeGo.scan.last.resolve({ groups: [], unreadable: [], locked: [] });

    await expect(result).resolves.toEqual({ groups: [], unreadable: [], locked: [] });
    expect(fakeGo.scan.calls).toHaveLength(1);
  });

  it("marks a call cancelled when its channel closes, and leaves settling it to the test", async () => {
    const updates = new Channel<ScanProgress>();
    const result = Clean.scan(updates);

    updates.close();
    expect(fakeGo.scan.last.cancelled).toBe(true);

    fakeGo.scan.last.reject(new Error("context canceled"));
    await expect(result).rejects.toThrow("context canceled");
  });

  it("names the method a test expected to be called", () => {
    expect(() => fakeGo.clean.last).toThrow("fake: Clean.clean was not called");
  });
});
