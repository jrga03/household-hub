/**
 * Sentry type definitions for optional observability integration.
 * Used when Sentry is loaded externally (not imported as a module).
 */

export interface SentryWindow extends Window {
  Sentry: {
    captureException: (
      error: unknown,
      opts?: {
        tags?: Record<string, string>;
        extra?: Record<string, unknown>;
      }
    ) => void;
  };
}

/**
 * Type guard to check if Sentry is available on window.
 */
export function hasSentry(win: Window): win is SentryWindow {
  return (
    "Sentry" in win &&
    typeof (win as { Sentry?: unknown }).Sentry === "object" &&
    (win as { Sentry?: { captureException?: unknown } }).Sentry !== null &&
    typeof (win as { Sentry: { captureException?: unknown } }).Sentry.captureException ===
      "function"
  );
}
