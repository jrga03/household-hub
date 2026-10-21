import { useState, useEffect } from "react";

/**
 * Custom hook for responsive design breakpoint detection
 *
 * Listens to window resize events and updates when media queries match.
 * Properly cleans up event listeners and handles SSR.
 *
 * @param query - Media query string (e.g., '(min-width: 840px)')
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    // Check if window is defined (client-side)
    if (typeof window !== "undefined") {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    // Skip if running on server
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia(query);

    // Update state if initial value was incorrect using microtask
    if (media.matches !== matches) {
      void Promise.resolve().then(() => setMatches(media.matches));
    }

    // Create event listener
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add event listener using the newer addEventListener if available
    if (media.addEventListener) {
      media.addEventListener("change", listener);
    } else {
      // Fallback for older browsers
      media.addListener(listener);
    }

    // Cleanup
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener("change", listener);
      } else {
        // Fallback for older browsers
        media.removeListener(listener);
      }
    };
  }, [query, matches]);

  return matches;
}

/** Material 3 window size classes: global navigation switches on these (#216). */
export type WindowClass = "compact" | "medium" | "expanded" | "large";

/** Below 600px. src/index.css mirrors it for the bottom tab bar's `--bottom-chrome`. */
export const COMPACT_QUERY = "(max-width: 599px)";
const EXPANDED_UP_QUERY = "(min-width: 840px)";
const LARGE_QUERY = "(min-width: 1200px)";

export function useWindowClass(): WindowClass {
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const isExpandedUp = useMediaQuery(EXPANDED_UP_QUERY);
  const isLarge = useMediaQuery(LARGE_QUERY);
  if (isCompact) return "compact";
  if (isLarge) return "large";
  return isExpandedUp ? "expanded" : "medium";
}
