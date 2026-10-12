import { useEffect, useState } from "react";

/** Whether the element is laid out: a detail pane is `hidden` below its breakpoint. */
export function useLaidOut(element: HTMLElement | null) {
  const [laidOut, setLaidOut] = useState(false);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setLaidOut((entry?.contentRect.width ?? 0) > 0)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return laidOut;
}
