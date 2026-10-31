const BASE_GAP = 8;

let cached: { top: number; right: number; bottom: number; left: number } | undefined;

// Rotation moves the Dynamic Island to a side, and it fires resize.
window.addEventListener("resize", () => {
  cached = undefined;
});

// Radix collisionPadding takes pixels, so the safe-area insets are read off a hidden element.
export function safeAreaPadding() {
  if (cached) return cached;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding:var(--safe-area-top) var(--safe-area-right) var(--safe-area-bottom) var(--safe-area-left)";
  document.body.append(probe);
  const style = window.getComputedStyle(probe);
  // eslint-disable-next-line arch/no-ad-hoc-money-parse -- a CSS pixel length, not an amount
  const withGap = (inset: string) => BASE_GAP + (parseFloat(inset) || 0);
  cached = {
    top: withGap(style.paddingTop),
    right: withGap(style.paddingRight),
    bottom: withGap(style.paddingBottom),
    left: withGap(style.paddingLeft),
  };
  probe.remove();
  return cached;
}
