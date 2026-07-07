import { useLiveQuery } from "dexie-react-hooks";
import { useAuthStore } from "@/stores/authStore";
import { useSyncStore } from "@/stores/syncStore";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { db } from "@/lib/dexie/db";

/**
 * useSyncStatus Hook
 *
 * Aggregates sync-related state from the single sources of truth:
 * - Online/offline status (browser connectivity)
 * - Pending count: reactive liveQuery on the LOCAL outbox (db.syncQueue),
 *   updating the instant the queue changes - no polling, no network
 * - Failed count: reactive liveQuery on terminal "failed" outbox items, so
 *   sync failures surface instead of reading as "All synced" (review R3)
 * - isSyncing: published by the sync processor via useSyncStore, so
 *   background syncs show correctly in every consumer (review SYNC-13)
 * - lastSyncTime: persisted in db.meta by the sync processor (survives
 *   reloads; replaces the old localStorage duplicate, review SYNC-11)
 *
 * @example
 * ```tsx
 * function SyncStatusBadge() {
 *   const { isOnline, pendingCount, isSyncing } = useSyncStatus();
 *   return <Badge>{isSyncing ? "Syncing..." : `${pendingCount} pending`}</Badge>;
 * }
 * ```
 */
export function useSyncStatus() {
  const user = useAuthStore((state) => state.user);
  const isOnline = useOnlineStatus();
  const status = useSyncStore((state) => state.status);

  const pendingCount =
    useLiveQuery(async () => {
      if (!user?.id) return 0;
      return db.syncQueue
        .where("status")
        .equals("queued")
        .filter((item) => item.user_id === user.id)
        .count();
    }, [user?.id]) ?? 0;

  const failedCount =
    useLiveQuery(async () => {
      if (!user?.id) return 0;
      return db.syncQueue
        .where("status")
        .equals("failed")
        .filter((item) => item.user_id === user.id)
        .count();
    }, [user?.id]) ?? 0;

  const lastSyncTime =
    useLiveQuery(async () => {
      const entry = await db.meta.get("lastSyncTime");
      return entry?.value ? new Date(entry.value as string) : null;
    }, []) ?? null;

  return {
    isOnline,
    pendingCount,
    failedCount,
    isSyncing: status === "syncing",
    lastSyncTime,
  };
}
