import { useEffect } from "react";

/** Scrolls the element named by the URL hash into view once `ready` (its content has loaded). */
export function useScrollToHash(ready = true) {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!ready || !hash) return;
    // Wait one frame so layout settles before scrolling.
    window.requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [ready]);
}
