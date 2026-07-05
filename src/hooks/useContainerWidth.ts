import { useState, useCallback, useRef } from "react";

/**
 * Observe an element's own width with ResizeObserver and report whether it is
 * below a breakpoint.
 *
 * Why not useMediaQuery: master-detail routes decide row-click behavior
 * (open a modal vs select into a detail pane) while PageShell decides pane
 * VISIBILITY via `@container` queries on the page region. Viewport media
 * queries disagree with container queries whenever the sidebar is expanded,
 * which produced a dead zone (~1500-1760px viewport) where clicking a row
 * selected into a hidden pane and appeared to do nothing (review UI-05).
 * Measuring the same element the container queries react to keeps the two
 * decisions in lockstep.
 *
 * Uses a CALLBACK ref so it attaches correctly even when the observed element
 * mounts conditionally (routes that early-return a loading state before
 * rendering their real container).
 *
 * @param breakpointPx - width below which `isNarrow` is true (match the
 *        PageShell `@[Npx]` breakpoint that toggles the pane)
 * @returns [callback ref to attach to the page-region element, isNarrow]
 */
export function useContainerNarrow<T extends HTMLElement = HTMLDivElement>(
  breakpointPx: number
): [(node: T | null) => void, boolean] {
  // Assume wide before first measurement: on desktop the pane is the common
  // case, and a one-frame correction is cheaper than a flash of the modal path
  const [isNarrow, setIsNarrow] = useState(false);
  const observerRef = useRef<InstanceType<typeof window.ResizeObserver> | null>(null);

  const refCallback = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect();

      // window.-prefixed for eslint no-undef (browser global not in env)
      if (!node || typeof window === "undefined" || !window.ResizeObserver) return;

      const observer = new window.ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? node.clientWidth;
        setIsNarrow(width < breakpointPx);
      });
      observer.observe(node);
      observerRef.current = observer;
    },
    [breakpointPx]
  );

  return [refCallback, isNarrow];
}
