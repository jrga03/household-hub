import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Full-screen loading component
 *
 * Shows during:
 * - Initial auth state check
 * - Route transitions while checking auth
 * - Any async operations that need full-screen loading
 *
 * Features branded loading with app logo and spinner
 */
export function LoadingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        {/* App Logo */}
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <span className="text-2xl font-bold">HH</span>
        </div>

        {/* App Name */}
        <h1 className="text-xl font-semibold">Household Hub</h1>

        {/* Loading Spinner (carries the role="status" announcement) */}
        <LoadingSpinner
          size="large"
          className="text-muted-foreground"
          label="Loading Household Hub"
        />

        {/* Visible loading text; hidden from screen readers so the spinner's
            status announcement isn't duplicated */}
        <p className="text-sm text-muted-foreground" aria-hidden="true">
          Loading...
        </p>
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
