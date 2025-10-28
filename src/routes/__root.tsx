import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { autoSyncManager } from "@/lib/sync/autoSync";
import { syncIssuesManager } from "@/lib/sync/SyncIssuesManager";
import { SyncIssuesPanel } from "@/components/SyncIssuesPanel";

/**
 * Root Component with Auto-Sync Integration and Sync Issues Panel
 *
 * Manages:
 * - Auto-sync lifecycle based on authentication state
 * - Sync issues panel initialization (loads persisted issues from IndexedDB)
 * - Global UI components (SyncIssuesPanel)
 *
 * Lifecycle:
 * 1. On mount: Load persisted sync issues from IndexedDB
 * 2. On login: Start auto-sync manager
 * 3. On logout: Stop auto-sync manager
 * 4. On unmount: Cleanup event listeners
 */
function RootComponent() {
  const user = useAuthStore((state) => state.user);

  // Load persisted sync issues from IndexedDB on mount
  useEffect(() => {
    syncIssuesManager.loadFromStorage();
  }, []);

  // Manage auto-sync lifecycle based on auth state
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
      <SyncIssuesPanel />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
