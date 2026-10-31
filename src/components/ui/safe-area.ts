const BASE_GAP = 8;

let probe: HTMLDivElement | undefined;

// Radix collisionPadding takes pixels, so env() insets are read off a hidden element.
export function safeAreaPadding() {
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.append(probe);
  }
  const style = window.getComputedStyle(probe);
  // eslint-disable-next-line arch/no-ad-hoc-money-parse -- a CSS pixel length, not an amount
  const inset = (value: string) => BASE_GAP + (parseFloat(value) || 0);
  return {
    top: inset(style.paddingTop),
    right: inset(style.paddingRight),
    bottom: inset(style.paddingBottom),
    left: inset(style.paddingLeft),
  };
}
