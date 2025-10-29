import { Loader2 } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        {/* App Logo */}
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <span className="text-2xl font-bold">HH</span>
        </div>

        {/* App Name */}
        <h1 className="text-xl font-semibold">Household Hub</h1>

        {/* Loading Spinner */}
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />

        {/* Loading Text */}
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

/**
 * Inline loading spinner for smaller contexts
 * Can be used in buttons, cards, or inline with content
 */
export function LoadingSpinner({
  className = "",
  size = "default",
}: {
  className?: string;
  size?: "small" | "default" | "large";
}) {
  const sizeClasses = {
    small: "h-4 w-4",
    default: "h-6 w-6",
    large: "h-8 w-8",
  };

  return (
    <Loader2 className={`animate-spin ${sizeClasses[size]} ${className}`} aria-label="Loading" />
  );
}
