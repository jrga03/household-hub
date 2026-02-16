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
    const interval = setInterval(async () => {
      try {
        const { error } = await supabase.auth.getSession();
        setIsOnline(!error);
      } catch {
        setIsOnline(false);
      }
    }, 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return isOnline;
}
