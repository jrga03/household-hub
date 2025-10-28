import { RouterProvider, createRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { Toaster } from "@/components/ui/sonner";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SyncIndicator } from "@/components/SyncIndicator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { realtimeSync } from "@/lib/realtime-sync";

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

  return (
    <TooltipProvider>
      <OfflineBanner />
      {/* Global sync status indicator (top-right) */}
      <div className="fixed top-4 right-4 z-50">
        <SyncIndicator />
      </div>
      <RouterProvider router={router} />
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
