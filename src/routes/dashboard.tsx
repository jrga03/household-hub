import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

/**
 * Legacy /dashboard route — redirects to / (the real dashboard).
 * Kept to avoid broken bookmarks.
 */
function Dashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/", replace: true });
  }, [navigate]);

  return null;
}
