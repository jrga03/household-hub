import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy /dashboard route - redirects to / (the real dashboard) before
 * rendering anything. Kept to avoid broken bookmarks.
 */
export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
