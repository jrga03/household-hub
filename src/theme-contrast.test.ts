import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { apcaContrast, composite, parseOklch, toSrgb, wcagContrast } from "./test/contrast";

type Theme = "light" | "dark";

const themeCss = readFileSync("src/index.css", "utf8");

function readTokens(selector: string): Map<string, string> {
  const block = new RegExp(`^${selector} \\{([\\s\\S]*?)^\\}`, "m").exec(themeCss);
  const body = block?.[1];
  if (body === undefined) {
    throw new Error(`No top-level ${selector} block in index.css`);
  }
  const tokens = new Map<string, string>();
  for (const [, name = "", value = ""] of body.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
    tokens.set(name, value.trim());
  }
  return tokens;
}

const lightTokens = readTokens(":root");
const themes: Record<Theme, Map<string, string>> = {
  light: lightTokens,
  dark: new Map([...lightTokens, ...readTokens("\\.dark")]),
};

function resolve(theme: Theme, token: string): string {
  const value = themes[theme].get(token);
  if (value === undefined) {
    throw new Error(`--${token} is not defined for ${theme}`);
  }
  const aliased = /^var\(--([\w-]+)\)$/.exec(value)?.[1];
  return aliased ? resolve(theme, aliased) : value;
}

function surfaceColor(theme: Theme, surface: string) {
  const color = parseOklch(resolve(theme, surface));
  if (color.alpha !== 1) {
    throw new Error(`Surface --${surface} must be opaque`);
  }
  return toSrgb(color);
}

function colorOn(theme: Theme, token: string, surface: string) {
  return composite(parseOklch(resolve(theme, token)), surfaceColor(theme, surface));
}

const PAGE_SURFACES = ["background", "card", "popover", "muted"];

/** Text that must reach WCAG 2 AA body contrast, 4.5:1. */
const textPairs: Array<[text: string, surface: string]> = [
  ...PAGE_SURFACES.map((surface): [string, string] => ["foreground", surface]),
  ["foreground", "secondary"],
  ["foreground", "accent"],
  ["foreground", "warning-surface"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["primary-foreground", "primary"],
  ["destructive-foreground", "destructive"],
  ["success-foreground", "success"],
  ...PAGE_SURFACES.flatMap((surface): Array<[string, string]> => [
    ["muted-foreground", surface],
    ["income", surface],
    ["shortfall", surface],
    ["warning", surface],
    ["success", surface],
    ["primary", surface],
  ]),
  ["destructive", "background"],
  ["destructive", "card"],
  ["destructive", "popover"],
  ["warning", "warning-surface"],
  ["muted-foreground", "secondary"],
  ["muted-foreground", "accent"],
];

/** Controls and indicators that must reach WCAG 2 AA non-text contrast, 3:1. */
const uiPairs: Array<[ui: string, surface: string]> = PAGE_SURFACES.flatMap(
  (surface): Array<[string, string]> => [
    ["input", surface],
    ["ring", surface],
    ["primary", surface],
    ["destructive", surface],
  ]
);

/** The most-read secondary text, held to APCA Lc 60 as well. */
const apcaPairs: Array<[text: string, surface: string]> = ["muted-foreground", "shortfall"].flatMap(
  (text) => ["background", "card", "muted"].map((surface): [string, string] => [text, surface])
);

describe.each<Theme>(["light", "dark"])("%s theme contrast", (theme) => {
  it.each(textPairs)("%s on %s reaches 4.5:1", (text, surface) => {
    const ratio = wcagContrast(colorOn(theme, text, surface), surfaceColor(theme, surface));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it.each(uiPairs)("%s on %s reaches 3:1", (ui, surface) => {
    const ratio = wcagContrast(colorOn(theme, ui, surface), surfaceColor(theme, surface));
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it.each(apcaPairs)("%s on %s reaches APCA Lc 60", (text, surface) => {
    const lightness = apcaContrast(colorOn(theme, text, surface), surfaceColor(theme, surface));
    expect(Math.abs(lightness)).toBeGreaterThanOrEqual(60);
  });
});
