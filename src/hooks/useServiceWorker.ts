import { useState, useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

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
    await updateServiceWorker(true);
  };

  return {
    needRefresh,
    update,
    dismiss: () => setNeedRefresh(false),
    isOffline,
  };
}
