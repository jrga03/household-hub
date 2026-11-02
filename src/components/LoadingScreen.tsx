import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppMark } from "@/components/app/AppMark";

const SLOW_START_MS = 1000;

/**
 * The start-up screen. It draws the same frame as the iOS splash
 * (scripts/generate-icons.mjs: a tile 25% of the short side, centered), so
 * the handoff from splash to app does not move. A spinner shows only on a slow start.
 */
export function LoadingScreen() {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <div className="relative">
        {/* eslint-disable-next-line better-tailwindcss/no-restricted-classes -- the splash image's radius, so the tile does not change shape */}
        <AppMark className="size-[25vmin] rounded-[22%]" />
        <span role="status" className="sr-only">
          Loading Household Hub
        </span>
        {isSlow && (
          <Loader2
            aria-hidden="true"
            className="absolute top-full left-1/2 mt-6 size-8 -translate-x-1/2 animate-spin text-muted-foreground"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Inline loading spinner for smaller contexts
 * Can be used in buttons, cards, or inline with content
 *
 * Accessibility (review R41): the `role="status"` + sr-only text live INSIDE
 * this component — an aria-label on the SVG alone is unreliable — so every
 * usage is announced without call sites doing anything.
 */
export function LoadingSpinner({
  className,
  size = "default",
  label = "Loading",
}: {
  className?: string;
  size?: "small" | "default" | "large";
  /** Screen-reader announcement, e.g. "Loading budgets" */
  label?: string;
}) {
  const sizeClasses = {
    small: "h-4 w-4",
    default: "h-6 w-6",
    large: "h-8 w-8",
  };

  return (
    <span role="status" className="inline-flex items-center justify-center">
      <Loader2 aria-hidden="true" className={cn("animate-spin", sizeClasses[size], className)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
