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
 * Sets every `<meta name="theme-color">` to the resolved `--background` token on
 * mount and whenever the class on `<html>` changes.
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
