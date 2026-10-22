// Tests and `vite --mode fake` must get the scripted fake wherever the app
// imports the generated client: the real one rejects outside MyGo.
import { describe, expect, it } from "vitest";
import { Clean, Status } from "../mygo";

describe("the MyGo client under test", () => {
  it("is the fake", async () => {
    await expect(Clean.ping()).resolves.toBeUndefined();
    await expect(Status.ping()).resolves.toBeUndefined();
  });
});
