import { useEffect } from "react";

function syncThemeColor() {
  const background = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--background")
    .trim();
  if (!background) {
    return;
  }
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", background);
  });
}

/**
 * Keeps the browser/PWA chrome color (`<meta name="theme-color">`) on the
 * resolved `--background` token (review R31).
 *
 * index.html ships paired media-attributed metas for the pre-hydration window.
 * Once mounted, both metas follow the token whenever next-themes swaps the
 * theme class on <html>, so the in-app toggle wins over the system preference.
 */
export function ThemeColorSync() {
  useEffect(() => {
    syncThemeColor();
    const observer = new window.MutationObserver(syncThemeColor);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return null;
}
