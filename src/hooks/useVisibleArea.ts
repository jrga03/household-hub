import { useEffect, useState } from "react";

interface VisibleArea {
  /** How far down the page the visible area starts, in px. */
  top: number;
  /** How much of the page bottom an on-screen keyboard covers, in px. */
  inset: number;
  viewportHeight: number;
}

/**
 * The part of the page the person can see. iOS Safari lays the keyboard over
 * the page, so `inset` is its height, and it may pan the visible area down
 * the page to show the focused field, which moves `top` and shrinks `inset`
 * by as much. Where the browser shrinks the page for the keyboard instead
 * (`interactive-widget=resizes-content`), both stay 0.
 */
export function useVisibleArea(): VisibleArea {
  const [area, setArea] = useState<VisibleArea>(() => ({
    top: 0,
    inset: 0,
    viewportHeight: window.visualViewport?.height ?? window.innerHeight,
  }));
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const covered = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
      // A pinch zoom shrinks and moves the visual viewport too; that isn't a keyboard.
      const zoomed = viewport.scale > 1;
      const viewportHeight = Math.round(viewport.height);
      const inset = covered > 0 && !zoomed ? covered : 0;
      const top = zoomed ? 0 : Math.max(0, Math.round(viewport.offsetTop));
      setArea((previous) =>
        previous.top === top &&
        previous.inset === inset &&
        previous.viewportHeight === viewportHeight
          ? previous
          : { top, inset, viewportHeight }
      );
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return area;
}
