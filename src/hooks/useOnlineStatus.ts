import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Listen to browser online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic health check (every 30 seconds)
    // Uses auth session check instead of querying business tables
    // to avoid RLS false negatives and reduce API load
    const checkHealth = async () => {
      try {
        const { error } = await supabase.auth.getSession();
        // getSession reads storage and succeeds offline, so it can't vouch for the connection alone.
        setIsOnline(navigator.onLine && !error);
      } catch {
        setIsOnline(false);
      }
    };
    const interval = setInterval(() => void checkHealth(), 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return isOnline;
}
