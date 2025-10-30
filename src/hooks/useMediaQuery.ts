import { useState, useEffect } from "react";

/**
 * Custom hook for responsive design breakpoint detection
 *
 * Listens to window resize events and updates when media queries match.
 * Properly cleans up event listeners and handles SSR.
 *
 * @param query - Media query string (e.g., '(min-width: 768px)')
 * @returns boolean indicating if the query matches
 *
 * @example
 * const isMobile = useMediaQuery('(max-width: 767px)');
 * const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
 * const isDesktop = useMediaQuery('(min-width: 1024px)');
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

/**
 * Convenience hooks for common breakpoints
 * Based on Tailwind CSS default breakpoints
 */

export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

export function useIsTablet(): boolean {
  return useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

export function useIsLargeDesktop(): boolean {
  return useMediaQuery("(min-width: 1280px)");
}

/**
 * Hook that returns the current breakpoint
 * Useful for conditional rendering based on screen size
 */
export type Breakpoint = "mobile" | "tablet" | "desktop" | "largeDesktop";

export function useBreakpoint(): Breakpoint {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isLargeDesktop = useIsLargeDesktop();

  if (isMobile) return "mobile";
  if (isTablet) return "tablet";
  if (isLargeDesktop) return "largeDesktop";
  return "desktop";
}
