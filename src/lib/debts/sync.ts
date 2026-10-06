/**
 * Debt Sync Queue Helpers
 *
 * Provides utilities for integrating debt events into the sync queue system.
 * Wraps the existing Supabase-based sync queue with debt-specific logic.
 *
 * Core Functions:
 * - getSyncStatusForDebt: Query current sync status for a debt entity
 * - getPendingDebtSyncCount: Count pending debt sync items
 *
 * Integration Pattern:
 * `outbox.ts` writes queue items; this module reads queue status.
 *
 * See src/lib/offline/syncQueue.ts for underlying sync queue operations.
 * See src/lib/sync/processor.ts for sync processing logic.
 *
 * @module debts/sync
 */

import { db } from "@/lib/dexie/db";
import type { SyncQueueStatus } from "@/types/sync";

/**
 * Sync status for UI display
 *
 * Simplified status that maps queue states to user-friendly states.
 */
export type DebtSyncStatus = "syncing" | "queued" | "failed" | "synced";

/**
 * Get sync status for a debt entity
 *
 * Reads the LOCAL sync queue (db.syncQueue) for the most recent outstanding
 * item for the given entity. Purely local IndexedDB, so it works offline,
 * costs nothing, and is truthful - the previous implementation polled
 * Supabase and reported "synced" on any error, including while offline
 * (review DEBT-08).
 *
 * Status Mapping:
 * - "syncing": Queue item status is "syncing"
 * - "queued": Queue item status is "queued"
 * - "failed": Queue item status is "failed"
 * - "synced": No outstanding queue items
 *
 * @param entityId - Debt entity ID
 * @param entityType - Entity type (debt | internal_debt | debt_payment)
 * @returns Promise resolving to sync status
 */
export async function getSyncStatusForDebt(
  entityId: string,
  entityType: "debt" | "internal_debt" | "debt_payment"
): Promise<DebtSyncStatus> {
  try {
    const outstanding = await db.syncQueue
      .where("entity_id")
      .equals(entityId)
      .filter((item) => item.entity_type === entityType && item.status !== "completed")
      .toArray();

    // Most recent item wins
    outstanding.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const latest = outstanding[0];
    if (!latest) {
      return "synced";
    }
    const status = latest.status as SyncQueueStatus;

    if (status === "syncing") return "syncing";
    if (status === "queued") return "queued";
    if (status === "failed") return "failed";

    return "synced";
  } catch (error) {
    console.error("[Debt Sync] Unexpected error getting sync status:", error);
    return "queued"; // Unknown state: claim pending, never a false "synced"
  }
}

/**
 * Get count of pending debt sync items
 *
 * Returns the total number of debt-related queue items that are pending sync
 * (status: queued, syncing, or failed).
 *
 * Useful for:
 * - UI badges showing pending sync count
 * - Deciding whether to show sync status indicator
 * - Monitoring sync queue health
 *
 * Query Strategy:
 * - Filter by entity_type IN ('debt', 'internal_debt', 'debt_payment')
 * - Filter by status IN ('queued', 'syncing', 'failed')
 * - Use COUNT(*) for efficiency
 *
 * Error Handling:
 * - Returns 0 on error (graceful degradation)
 * - All errors logged to console
 *
 * @returns Promise resolving to count of pending items
 *
 * @example
 * const count = await getPendingDebtSyncCount();
 * if (count > 0) {
 *   console.log(`${count} debt changes waiting to sync`);
 * }
 *
 * @example
 * // Use for UI badge
 * const count = await getPendingDebtSyncCount();
 * const badgeText = count > 0 ? `${count} pending` : "All synced";
 */
export async function getPendingDebtSyncCount(): Promise<number> {
  try {
    return await db.syncQueue
      .where("status")
      .anyOf("queued", "syncing", "failed")
      .filter((item) => ["debt", "internal_debt", "debt_payment"].includes(item.entity_type))
      .count();
  } catch (error) {
    console.error("[Debt Sync] Unexpected error getting pending count:", error);
    return 0;
  }
}
