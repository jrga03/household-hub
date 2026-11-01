import { useSyncExternalStore } from "react";

interface VisibleArea {
  /** How far down the page the visible area starts, in px. */
  top: number;
  /** How much of the page bottom an on-screen keyboard covers, in px. */
  inset: number;
  /** The keyboard's height (`top + inset`), which stays the same while iOS pans. */
  keyboardHeight: number;
  viewportHeight: number;
}

/**
 * The part of the page the person can see. iOS Safari lays the keyboard over
 * the page, so `inset` is its height, and it may pan the visible area down
 * the page to show the focused field, which moves `top` and shrinks `inset`
 * by as much. Where the browser shrinks the page for the keyboard instead
 * (`interactive-widget=resizes-content`), both stay 0.
 */
export function readVisibleArea(): VisibleArea {
  const viewport = window.visualViewport;
  if (!viewport) {
    return { top: 0, inset: 0, keyboardHeight: 0, viewportHeight: window.innerHeight };
  }
  const covered = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
  // A pinch zoom shrinks and moves the visual viewport too; that isn't a keyboard.
  const zoomed = viewport.scale > 1;
  const inset = covered > 0 && !zoomed ? covered : 0;
  const top = zoomed ? 0 : Math.max(0, Math.round(viewport.offsetTop));
  return { top, inset, keyboardHeight: top + inset, viewportHeight: Math.round(viewport.height) };
}

/** Calls `onChange` whenever the visible area moves or resizes; returns the unsubscribe. */
export function subscribeToVisibleArea(onChange: () => void) {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  viewport.addEventListener("resize", onChange);
  viewport.addEventListener("scroll", onChange);
  return () => {
    viewport.removeEventListener("resize", onChange);
    viewport.removeEventListener("scroll", onChange);
  };
}

/** Re-renders only when the picked number changes, so a pan doesn't re-render a component that ignores `top`. */
export function useVisibleAreaPart(pick: (area: VisibleArea) => number): number {
  return useSyncExternalStore(subscribeToVisibleArea, () => pick(readVisibleArea()));
}

export function useVisibleArea(): VisibleArea {
  return {
    top: useVisibleAreaPart((area) => area.top),
    inset: useVisibleAreaPart((area) => area.inset),
    keyboardHeight: useVisibleAreaPart((area) => area.keyboardHeight),
    viewportHeight: useVisibleAreaPart((area) => area.viewportHeight),
  };
}
