import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /analytics.
 *
 * This file previously rendered the tabs page directly WITHOUT an <Outlet>,
 * which made the child route /analytics/categories dead on all platforms
 * (mobile UX review, low-severity chart items). The tabs page now lives in
 * `analytics/index.tsx` so that when a child route is active it owns the
 * view, and the sidebar links to both /analytics and /analytics/categories
 * work. URL scheme is unchanged.
 */
export const Route = createFileRoute("/analytics")({
  component: AnalyticsLayout,
});

function AnalyticsLayout() {
  return <Outlet />;
}
