import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pwaManifest } from "../../vite.config";

const publicDir = path.resolve(import.meta.dirname, "../../public");

function pngSize(file: string) {
  const png = readFileSync(path.join(publicDir, file));
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
}

describe("PWA manifest icons", () => {
  it.each(pwaManifest.icons)("$src ($purpose) exists at its listed size", (icon) => {
    expect(pngSize(icon.src)).toBe(icon.sizes);
  });

  it("lists the maskable icon as its own file", () => {
    const maskable = pwaManifest.icons.filter((icon) => icon.purpose === "maskable");
    const anySources = pwaManifest.icons
      .filter((icon) => icon.purpose === "any")
      .map((icon) => icon.src);

    expect(maskable).toHaveLength(1);
    expect(anySources).not.toContain(maskable[0]!.src);
  });
});
