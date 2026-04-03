import { RouterProvider, createRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";

import { UpdatePrompt } from "@/components/UpdatePrompt";
import { StorageWarning } from "@/components/StorageWarning";
import { NetworkStatus } from "@/components/NetworkStatus";
import { TooltipProvider } from "@/components/ui/tooltip";
import { realtimeSync } from "@/lib/realtime-sync";
import { eventCompactor } from "@/lib/event-compactor";
import { registerBackgroundSync, unregisterBackgroundSync } from "@/lib/background-sync";
import { syncProcessor } from "@/lib/sync/processor";
import { useAuthStore } from "@/stores/authStore";

// Create router instance
const router = createRouter({ routeTree });

// Type augmentation for router (enables autocomplete)
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  const user = useAuthStore((state) => state.user);
  const initializeAuth = useAuthStore((state) => state.initialize);

  // Initialize auth state on app mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Initialize realtime sync on app mount
  useEffect(() => {
    async function initSync() {
      await realtimeSync.initialize();
    }

    initSync();

    // Cleanup subscriptions on unmount
    return () => {
      realtimeSync.cleanup();
    };
  }, []);

  // Register background sync with multi-strategy fallback (iOS Safari support)
  // Consolidates all network event handling in one place
  useEffect(() => {
    if (!user?.id) return;

    registerBackgroundSync(async () => {
      // 1. Trigger realtime reconnection
      realtimeSync.handleReconnection();
      // 2. Process sync queue for offline changes
      await syncProcessor.processQueue(user.id);
    });

    return () => {
      unregisterBackgroundSync();
    };
  }, [user?.id]);

  // Handle reconnection when app comes back into focus (iOS Safari)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        realtimeSync.handleReconnection();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Schedule periodic event compaction (production only)
  useEffect(() => {
    // Run startup compaction after 5 seconds (allow app to initialize)
    const startupTimer = setTimeout(async () => {
      console.log("[App] Running startup compaction...");
      const stats = await eventCompactor.compactAll();
      console.log("[App] Startup compaction complete:", stats);
    }, 5000);

    // Schedule daily compaction at 3 AM local time (production only)
    function scheduleDailyCompaction() {
      const now = new Date();
      const next3AM = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1, // Next day
        3, // 3 AM
        0,
        0
      );
      const msUntil3AM = next3AM.getTime() - now.getTime();

      const dailyTimer = setTimeout(async () => {
        console.log("[App] Running scheduled compaction at 3 AM...");
        const stats = await eventCompactor.compactAll();
        console.log("[App] Daily compaction complete:", stats);

        // Schedule next run
        scheduleDailyCompaction();
      }, msUntil3AM);

      return dailyTimer;
    }

    // Only schedule daily compaction in production
    const dailyTimer = import.meta.env.PROD ? scheduleDailyCompaction() : null;

    return () => {
      clearTimeout(startupTimer);
      if (dailyTimer) clearTimeout(dailyTimer);
    };
  }, []);

  return (
    <ErrorBoundary>
      <TooltipProvider>
        {/* Offline indicator (user-dismissible with retry button and pending count) */}
        <OfflineBanner />

        {/* Storage quota warning (shows at 80%+ usage) */}
        <div className="fixed top-16 left-4 right-4 z-40 md:left-auto md:w-96">
          <StorageWarning />
        </div>

        <ErrorBoundary>
          <RouterProvider router={router} />
        </ErrorBoundary>
        <Toaster />

        {/* Service worker update prompt (bottom-right) */}
        <UpdatePrompt />

        {/* Network status indicator (bottom-left) - For debt sync visibility */}
        <NetworkStatus />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
