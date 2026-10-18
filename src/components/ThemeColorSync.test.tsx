import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { ThemeColorSync } from "./ThemeColorSync";

const LIGHT_BACKGROUND = "oklch(0.975 0.007 80)";
const DARK_BACKGROUND = "oklch(0.19 0.006 70)";

function themeColors() {
  return [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
    meta.getAttribute("content")
  );
}

describe("ThemeColorSync", () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <style>:root { --background: ${LIGHT_BACKGROUND}; } .dark { --background: ${DARK_BACKGROUND}; }</style>
      <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a" />`;
    document.documentElement.className = "light";
  });

  afterEach(() => {
    document.head.innerHTML = "";
    document.documentElement.className = "";
  });

  it("sets both metas to the light background token", () => {
    render(<ThemeColorSync />);
    expect(themeColors()).toEqual([LIGHT_BACKGROUND, LIGHT_BACKGROUND]);
  });

  it("follows the background token when the theme switches to dark", async () => {
    render(<ThemeColorSync />);
    await act(async () => {
      document.documentElement.className = "dark";
      await Promise.resolve();
    });
    expect(themeColors()).toEqual([DARK_BACKGROUND, DARK_BACKGROUND]);
  });
});
