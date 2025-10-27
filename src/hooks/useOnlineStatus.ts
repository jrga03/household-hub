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
    const interval = setInterval(async () => {
      try {
        // Check transactions table (most critical for app functionality)
        const { error } = await supabase.from("transactions").select("id").limit(1).maybeSingle();

        setIsOnline(!error);
      } catch (error) {
        console.warn("[useOnlineStatus] Health check failed:", error);
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
