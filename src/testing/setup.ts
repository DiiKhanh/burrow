import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetFake } from "./mygo.fake";

afterEach(() => {
  cleanup();
  resetFake();
});
