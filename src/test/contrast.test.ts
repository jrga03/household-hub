import { describe, expect, it } from "vitest";
import { apcaContrast, parseOklch, toSrgb, wcagContrast } from "./contrast";

const white = parseOklch("oklch(1 0 0)");
const black = parseOklch("oklch(0 0 0)");
const grey = (hex: string) => {
  const channel = parseInt(hex, 16) / 255;
  return { r: channel, g: channel, b: channel };
};

describe("parseOklch and toSrgb", () => {
  it("converts pure red within rounding", () => {
    const red = toSrgb(parseOklch("oklch(0.62796 0.25768 29.2339)"));
    expect(red.r).toBeCloseTo(1, 2);
    expect(red.g).toBeCloseTo(0, 2);
    expect(red.b).toBeCloseTo(0, 2);
  });

  it("reads an alpha channel", () => {
    expect(parseOklch("oklch(0.3 0.03 70 / 0.14)").alpha).toBe(0.14);
    expect(parseOklch("oklch(1 0 0 / 10%)").alpha).toBe(0.1);
  });

  it("rejects values that are not oklch", () => {
    expect(() => parseOklch("#ffffff")).toThrow();
  });
});

describe("wcagContrast", () => {
  it("matches published WCAG 2 ratios", () => {
    expect(wcagContrast(toSrgb(black), toSrgb(white))).toBeCloseTo(21, 1);
    expect(wcagContrast(grey("77"), toSrgb(white))).toBeCloseTo(4.48, 2);
  });
});

describe("apcaContrast", () => {
  it("matches published APCA 0.0.98G Lc values", () => {
    expect(apcaContrast(toSrgb(black), toSrgb(white))).toBeCloseTo(106.04, 1);
    expect(apcaContrast(toSrgb(white), toSrgb(black))).toBeCloseTo(-107.88, 1);
    expect(apcaContrast(grey("88"), toSrgb(white))).toBeCloseTo(63.06, 1);
  });
});
