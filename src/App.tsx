import { RouterProvider, createRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { routeTree } from "./routeTree.gen";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { StorageWarning } from "@/components/StorageWarning";
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
  // Auth initialization lives in ONE place: AuthProvider (main.tsx wraps App
  // with it). The store's initialize() is idempotent either way (review UI-12).

  // Initialize realtime sync on app mount.
  // Sync TRIGGERS (online/visibility/focus/periodic) live in ONE place:
  // autoSyncManager, started per-user in routes/__root.tsx. It pushes the
  // local outbox and pulls remote changes (debounced handleReconnection).
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
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        storageKey="household-hub-theme"
      >
        <TooltipProvider>
          {/* The single offline banner renders in AppLayout (sync/OfflineBanner) */}

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
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
