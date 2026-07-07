import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Colors must match the app's `--background` token in src/index.css:
 * light `oklch(1 0 0)` = #ffffff, dark `oklch(0.145 0 0)` = #0a0a0a.
 */
const THEME_COLORS = {
  light: "#ffffff",
  dark: "#0a0a0a",
} as const;

/**
 * Keeps the browser/PWA chrome color (`<meta name="theme-color">`) in sync
 * with the app's RESOLVED theme (review R31).
 *
 * index.html ships paired media-attributed theme-color metas that cover the
 * pre-hydration window via the system preference. Once React mounts, the
 * in-app theme toggle (not just the system preference) drives the theme, so
 * both metas are rewritten to the resolved color; whichever meta the browser
 * matches then reports the correct value.
 *
 * Must render inside the next-themes ThemeProvider.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") {
      return;
    }
    const color = THEME_COLORS[resolvedTheme];
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute("content", color);
    });
  }, [resolvedTheme]);

  return null;
}
