import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.resolve(import.meta.dirname, "../..", file), "utf8");

it("reads the theme from the key next-themes writes", () => {
  const appKey = /storageKey="([^"]+)"/.exec(read("src/App.tsx"))?.[1];
  const bootKey = /localStorage\.getItem\("([^"]+)"\)/.exec(read("public/theme-boot.js"))?.[1];

  expect(appKey).toBeDefined();
  expect(bootKey).toBe(appKey);
});
