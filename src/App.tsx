import { RouterProvider, createRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { Toaster } from "@/components/ui/sonner";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SyncIndicator } from "@/components/SyncIndicator";
import { InstallPrompt } from "@/components/InstallPrompt";
import { TooltipProvider } from "@/components/ui/tooltip";
import { realtimeSync } from "@/lib/realtime-sync";
import { eventCompactor } from "@/lib/event-compactor";

// Create router instance
const router = createRouter({ routeTree });

// Type augmentation for router (enables autocomplete)
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
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

  // Handle reconnection when network comes back online
  useEffect(() => {
    function handleOnline() {
      realtimeSync.handleReconnection();
    }

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

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
    <TooltipProvider>
      <OfflineBanner />
      {/* Global sync status indicator (top-right) */}
      <div className="fixed top-4 right-4 z-50">
        <SyncIndicator />
      </div>
      <RouterProvider router={router} />
      <Toaster />
      {/* PWA install prompt (conditionally rendered) */}
      <InstallPrompt />
    </TooltipProvider>
  );
}

export default App;
