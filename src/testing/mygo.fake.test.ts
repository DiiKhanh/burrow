// Tests and `vite --mode fake` must get the fake wherever the app imports the
// generated client: the real one rejects outside MyGo.
import { Channel } from "mygo-runtime";
import { describe, expect, it } from "vitest";
import { Clean, type CleanProgress, Privacy, type ScanProgress, Status } from "../mygo";
import { fakeGo } from "./mygo.fake";

describe("the MyGo client under test", () => {
  it("is the fake", async () => {
    await expect(Status.enabled()).resolves.toEqual([]);
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

  it("marks a Clean cancelled when its channel closes", () => {
    const updates = new Channel<CleanProgress>();
    void Clean.clean(["id"], updates);

    updates.close();
    expect(fakeGo.clean.last.cancelled).toBe(true);
  });

  it("passes a call made with options to the test", async () => {
    const result = Privacy.openFullDiskAccess.with({ signal: new AbortController().signal })();

    fakeGo.privacy.last.resolve("full-disk-access");

    await expect(result).resolves.toBe("full-disk-access");
  });

  it("rejects a call with its signal's reason when the signal aborts, as MyGo does", async () => {
    const abort = new AbortController();
    const result = Privacy.openFullDiskAccess.with({ signal: abort.signal })();

    abort.abort(new Error("left the page"));

    await expect(result).rejects.toThrow("left the page");
    expect(fakeGo.privacy.calls).toHaveLength(1);
  });

  it("rejects a call made with an aborted signal", async () => {
    const result = Privacy.openFullDiskAccess.with({ signal: AbortSignal.abort(new Error("too late")) })();

    await expect(result).rejects.toThrow("too late");
  });

  it("names the method a test expected to be called", () => {
    expect(() => fakeGo.clean.last).toThrow("fake: Clean.clean was not called");
  });
});
