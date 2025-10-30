import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { getQueueCount } from "@/lib/offline/syncQueue";
import { useSyncProcessor } from "@/hooks/useSyncProcessor";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * useSyncStatus Hook
 *
 * Aggregates sync-related state from multiple sources:
 * - Online/offline status (browser connectivity)
 * - Pending sync queue count (IndexedDB)
 * - Active sync operation status (TanStack Query mutation)
 * - Last successful sync timestamp (localStorage)
 *
 * @returns {object} Sync status data
 * @property {boolean} isOnline - Browser online status
 * @property {number} pendingCount - Number of items waiting to sync
 * @property {boolean} isSyncing - Whether sync is actively running
 * @property {Date | null} lastSyncTime - Timestamp of last successful sync
 *
 * @example
 * ```tsx
 * function SyncIndicator() {
 *   const { isOnline, pendingCount, isSyncing } = useSyncStatus();
 *   return <Badge>{isSyncing ? "Syncing..." : `${pendingCount} pending`}</Badge>;
 * }
 * ```
 */
export function useSyncStatus() {
  const user = useAuthStore((state) => state.user);
  const isOnline = useOnlineStatus();
  const { isPending: isSyncing } = useSyncProcessor();
  const lastUpdateRef = useRef<number>(0);

  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => {
    try {
      const stored = localStorage.getItem("lastSyncTime");
      return stored ? new Date(stored) : null;
    } catch (err) {
      console.warn("[useSyncStatus] Failed to read lastSyncTime from localStorage:", err);
      return null;
    }
  });

  const { data: pendingCount = 0, isLoading: isLoadingCount } = useQuery({
    queryKey: ["offline", "sync", "queue", "count"],
    queryFn: () => (user?.id ? getQueueCount(user.id) : 0),
    enabled: !!user?.id && isOnline,
    refetchInterval: 10000, // Refresh every 10s
    staleTime: 5000, // Don't refetch if data less than 5s old
  });

  // Update last sync time when queue empties (with debouncing)
  useEffect(() => {
    if (pendingCount === 0 && !isSyncing && isOnline) {
      const now = Date.now();

      // Only update if at least 1 second has passed since last update
      // Prevents rapid-fire updates during quick sync cycles
      if (now - lastUpdateRef.current > 1000) {
        const timestamp = new Date(now);
        // Use microtask to avoid setState during effect
        void Promise.resolve().then(() => setLastSyncTime(timestamp));

        try {
          localStorage.setItem("lastSyncTime", timestamp.toISOString());
        } catch (err) {
          // Silently fail - localStorage not critical for functionality
          // User still sees correct lastSyncTime in memory
          console.warn("[useSyncStatus] Failed to persist lastSyncTime:", err);
        }

        lastUpdateRef.current = now;
      }
    }
  }, [pendingCount, isSyncing, isOnline]);

  return {
    isOnline,
    pendingCount,
    isSyncing: isSyncing || isLoadingCount, // Treat loading as syncing
    lastSyncTime,
  };
}
