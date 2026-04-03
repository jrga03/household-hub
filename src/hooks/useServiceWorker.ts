import { useState, useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// Module-level guard: useServiceWorker is called from multiple components
// (UpdatePrompt, OfflineIndicator), each triggering onRegistered independently.
// Without this, duplicate polling intervals would stack.
let updatePollingStarted = false;

/**
 * Service worker hook for managing PWA updates and offline state
 *
 * @returns Object containing:
 *   - needRefresh: boolean - Whether a new version is available
 *   - update: () => Promise<void> - Function to trigger update
 *   - dismiss: () => void - Function to dismiss update prompt
 *   - isOffline: boolean - Whether the app is currently offline
 */
export function useServiceWorker() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration: ServiceWorkerRegistration | undefined) {
      console.log("SW registered:", registration);
      if (registration && !updatePollingStarted) {
        updatePollingStarted = true;
        // Check for updates every 15 minutes.
        // Installed PWAs may not re-fetch the SW file on launch
        // (browsers cache SW for up to 24h).
        setInterval(
          () => {
            registration.update();
          },
          15 * 60 * 1000
        );
      }
    },
    onRegisterError(error: Error) {
      console.error("SW registration error:", error);
    },
  });

  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      console.log("App is online");
    };

    const handleOffline = () => {
      setIsOffline(true);
      console.log("App is offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const update = async () => {
    // Listen for the new SW to take control (works on most browsers)
    const controllerChanged = new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
        once: true,
      });
    });

    await updateServiceWorker(true);

    // Wait for controllerchange, fall back after 3s for iOS standalone PWA
    // where the event may not fire despite skipWaiting() succeeding
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
    await Promise.race([controllerChanged, timeout]);

    window.location.reload();
  };

  return {
    needRefresh,
    update,
    dismiss: () => setNeedRefresh(false),
    isOffline,
  };
}
