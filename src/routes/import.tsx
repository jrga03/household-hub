import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

/**
 * Layout route for /import; its only child is /import/pdf. CSV import will be
 * rebuilt on the draft pipeline (createImportSession -> confirmDrafts), see
 * docs/plans/2026-09-30-phase-0-live-bugs-design.md.
 */
export const Route = createFileRoute("/import")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/import") {
      throw redirect({ to: "/import/pdf" });
    }
  },
  component: ImportLayout,
});

function ImportLayout() {
  return <Outlet />;
}
