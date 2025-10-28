import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { autoSyncManager } from "@/lib/sync/autoSync";
import { syncIssuesManager } from "@/lib/sync/SyncIssuesManager";
import { SyncIssuesPanel } from "@/components/SyncIssuesPanel";
import { ensureDeviceRegistered, triggerDeviceLastSeenUpdate } from "@/lib/device-registration";

/**
 * Root Component with Device Registration, Auto-Sync, and Sync Issues Panel
 *
 * Manages:
 * - Device registration in Supabase devices table (chunk 027)
 * - Device last_seen updates on window focus (throttled to 1/minute)
 * - Auto-sync lifecycle based on authentication state
 * - Sync issues panel initialization (loads persisted issues from IndexedDB)
 * - Global UI components (SyncIssuesPanel)
 *
 * Lifecycle:
 * 1. On mount: Load persisted sync issues from IndexedDB
 * 2. On login: Register device → Start auto-sync manager
 * 3. On window focus: Update device last_seen (throttled)
 * 4. On logout: Stop auto-sync manager
 * 5. On unmount: Cleanup event listeners
 *
 * Device registration happens BEFORE auto-sync to ensure:
 * - Device exists in database before sync operations
 * - Events can be attributed to correct device_id
 * - RLS policies can verify device ownership
 */
function RootComponent() {
  const user = useAuthStore((state) => state.user);

  // Load persisted sync issues from IndexedDB on mount
  useEffect(() => {
    syncIssuesManager.loadFromStorage();
  }, []);

  // Register device on login (chunk 027)
  // Device registration happens automatically in DeviceManager.getDeviceId()
  // which is called by ensureDeviceRegistered(). DeviceManager handles:
  // - Device registration in Supabase devices table
  // - Duplicate registration prevention
  // - last_seen updates (throttled to 5 minutes)
  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id; // Capture for closure

    async function register() {
      try {
        await ensureDeviceRegistered(userId);
        console.log("Device registered successfully");
      } catch (error) {
        console.error("Device registration failed:", error);
        // Don't block app if registration fails
        // Sync operations may still work with cached device ID
      }
    }

    register();
  }, [user?.id]);

  // Update device last_seen on window focus (chunk 027)
  // DeviceManager handles throttling automatically (5-minute minimum)
  useEffect(() => {
    function handleFocus() {
      if (user?.id) {
        triggerDeviceLastSeenUpdate();
      }
    }

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [user?.id]);

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
