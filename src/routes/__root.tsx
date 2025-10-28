import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { autoSyncManager } from "@/lib/sync/autoSync";

/**
 * Root Component with Auto-Sync Integration
 *
 * Manages auto-sync lifecycle based on authentication state:
 * - Starts auto-sync when user logs in
 * - Stops auto-sync when user logs out
 * - Cleans up event listeners on unmount
 */
function RootComponent() {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (user?.id) {
      // User is authenticated - start auto-sync
      console.log("Starting auto-sync for user:", user.id);
      autoSyncManager.start(user.id);

      return () => {
        // Cleanup on logout or unmount
        console.log("Stopping auto-sync");
        autoSyncManager.stop();
      };
    }
  }, [user?.id]); // Only re-run if user ID changes (login/logout), not on user object updates

  return (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
