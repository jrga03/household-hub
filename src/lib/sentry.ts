import * as Sentry from "@sentry/react";

/**
 * Initialize Sentry error tracking for production
 *
 * Features:
 * - Production-only (disabled in development)
 * - PII scrubbing for financial data (Decision #87)
 * - Removes sensitive fields: amounts, descriptions, emails
 * - Ignores common non-errors
 * - No session replay for privacy
 */
export function initSentry() {
  // Only initialize in production with valid DSN
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,

      // Performance monitoring (10% of transactions)
      tracesSampleRate: 0.1,

      // Integrations
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          // Disable session replay for finance app privacy
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],

      // PII Scrubbing (Decision #87)
      beforeSend(event) {
        // Remove sensitive data from request payloads
        if (event.request?.data) {
          const data = event.request.data as Record<string, unknown>;

          // Scrub financial data
          delete data.amount_cents;
          delete data.amount;
          delete data.description;
          delete data.notes;
          delete data.account_number;
          delete data.balance;
          delete data.balance_cents;

          // Scrub personal info
          delete data.email;
          delete data.phone;
          delete data.address;
        }

        // Remove sensitive breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.filter((breadcrumb) => {
            const message = breadcrumb.message?.toLowerCase() || "";
            const category = breadcrumb.category?.toLowerCase() || "";

            // Filter out breadcrumbs containing financial data
            return (
              !message.includes("amount") &&
              !message.includes("balance") &&
              !message.includes("₱") &&
              !message.includes("php") &&
              !category.includes("transaction") &&
              !category.includes("account")
            );
          });
        }

        // Remove PII from user context
        if (event.user) {
          delete event.user.email;
          delete event.user.ip_address;
          delete event.user.username;

          // Keep only anonymous identifier (handle both string and number types)
          if (event.user.id) {
            const userId = String(event.user.id);
            event.user.id = `user_${userId.substring(0, 8)}`;
          }
        }

        // Scrub sensitive data from exception messages
        if (event.exception?.values) {
          event.exception.values = event.exception.values.map((exception) => {
            if (exception.value) {
              // Remove numbers that could be amounts
              exception.value = exception.value.replace(
                /\d{1,3}(,\d{3})*(\.\d{2})?/g,
                "[REDACTED]"
              );
              // Remove email addresses
              exception.value = exception.value.replace(/[\w.-]+@[\w.-]+\.\w+/g, "[EMAIL]");
            }
            return exception;
          });
        }

        // Scrub sensitive context data
        if (event.contexts) {
          delete event.contexts.transaction;
          delete event.contexts.account;
          delete event.contexts.budget;
        }

        // Scrub extra data
        if (event.extra) {
          const extra = event.extra as Record<string, unknown>;
          delete extra.amount;
          delete extra.amount_cents;
          delete extra.description;
          delete extra.notes;
        }

        return event;
      },

      // Ignore common non-errors
      ignoreErrors: [
        // Browser extensions
        "top.GLOBALS",
        "chrome-extension://",
        "moz-extension://",

        // ResizeObserver (common, harmless)
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications",

        // Network errors (handled gracefully)
        "NetworkError",
        "Failed to fetch",
        "Network request failed",

        // Non-Error promises (not actionable)
        "Non-Error promise rejection captured",
        "Non-Error exception captured",

        // Aborted operations (user-initiated)
        "AbortError",
        "The operation was aborted",

        // Cancelled operations (expected)
        "cancelled",
        "canceled",
      ],

      // Disable session replay (privacy-first for finance app)
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,

      // Release tracking (from package.json version)
      release: `household-hub@${import.meta.env.VITE_APP_VERSION || "dev"}`,

      // Send user feedback along with events
      beforeBreadcrumb(breadcrumb) {
        // Don't capture console.log breadcrumbs in production
        if (breadcrumb.category === "console") {
          return null;
        }

        // Scrub URLs containing sensitive data
        if (breadcrumb.data?.url) {
          const url = new URL(breadcrumb.data.url, window.location.origin);

          // Remove query parameters (may contain sensitive data)
          url.search = "";

          // Remove hash (may contain sensitive data)
          url.hash = "";

          breadcrumb.data.url = url.toString();
        }

        return breadcrumb;
      },
    });

    // Set custom tags for better filtering
    Sentry.setTag("app", "household-hub");
    Sentry.setTag("platform", "web");

    console.info("✅ Sentry error tracking initialized");
  } else if (import.meta.env.DEV) {
    console.info("ℹ️  Sentry disabled in development mode");
  } else {
    console.warn("⚠️  Sentry DSN not configured");
  }
}
