// Components style only through the tokens in styles.css and take text only
// from the catalog in strings.ts (ADR 0002, issue #13).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = import.meta.dirname;

const components = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
  .map((file) => ({ file: relative(SRC, join(SRC, file)), source: readFileSync(join(SRC, file), "utf8") }));

function offenders(pattern: RegExp) {
  return components.flatMap(({ file, source }) => (source.match(pattern) ?? []).map((match) => `${file}: ${match}`));
}

describe("components", () => {
  it("exist to check", () => {
    expect(components.length).toBeGreaterThan(0);
  });

  it("use no arbitrary Tailwind values", () => {
    expect(offenders(/[\w:-]+-\[[^\]]*\]/g)).toEqual([]);
  });

  it("use no inline styles", () => {
    expect(offenders(/style=\{/g)).toEqual([]);
  });

  it("use no literal colors", () => {
    expect(offenders(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/gi)).toEqual([]);
  });

  it("hardcode no text", () => {
    // JSX text between tags, e.g. <span>Scan</span>; an arrow's `=>` is not a tag.
    expect(offenders(/(?<!=)>\s*[A-Za-z][^<>{}]*</g)).toEqual([]);
  });
});
