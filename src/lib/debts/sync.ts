/**
 * Debt Sync Queue Helpers
 *
 * Provides utilities for integrating debt events into the sync queue system.
 * Wraps the existing Supabase-based sync queue with debt-specific logic.
 *
 * Core Functions:
 * - addDebtEventToSyncQueue: Add debt event to sync queue for server synchronization
 * - getSyncStatusForDebt: Query current sync status for a debt entity
 * - getPendingDebtSyncCount: Count pending debt sync items
 *
 * Integration Pattern:
 * Event creation → addDebtEventToSyncQueue → Supabase sync_queue table → Sync processor
 *
 * See src/lib/offline/syncQueue.ts for underlying sync queue operations.
 * See src/lib/sync/processor.ts for sync processing logic.
 *
 * @module debts/sync
 */

import { supabase } from "@/lib/supabase";
import { db } from "@/lib/dexie/db";
import { addToSyncQueue } from "@/lib/offline/syncQueue";
import type { AnyDebtEvent } from "@/types/debt";
import type { EntityType, SyncQueueStatus } from "@/types/sync";

/**
 * Sync status for UI display
 *
 * Simplified status that maps queue states to user-friendly states.
 */
export type DebtSyncStatus = "syncing" | "queued" | "failed" | "synced";

/**
 * Get current user ID from the locally persisted Supabase session.
 *
 * Uses getSession() (local read) rather than getUser() (network validation)
 * so debt mutations still work offline. Throws when unauthenticated: an
 * event attributed to nobody is worse than a failed mutation.
 *
 * @returns Promise resolving to the authenticated user's ID
 */
export async function getCurrentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("Not authenticated: cannot record debt activity");
  }

  return userId;
}

/**
 * Add debt event to sync queue
 *
 * Wraps the existing addToSyncQueue function with debt-specific logic.
 * Converts debt event into sync queue format and inserts into Supabase sync_queue table.
 *
 * Flow:
 * 1. Extract entity type and ID from event
 * 2. Build payload from event (contains full event structure)
 * 3. Get current user ID for RLS
 * 4. Call addToSyncQueue with debt entity details
 *
 * Error Handling:
 * - Returns success: false with error message on failure
 * - All errors logged to console
 * - Graceful degradation (doesn't throw)
 *
 * @param event - Debt event (DebtEvent | InternalDebtEvent | DebtPaymentEvent)
 * @returns Promise resolving to sync queue item ID or null on error
 *
 * @example
 * // After creating debt event
 * const event = await createDebtEvent(debt, "create");
 * const queueId = await addDebtEventToSyncQueue(event);
 *
 * if (queueId) {
 *   console.log("Queued for sync:", queueId);
 * } else {
 *   console.error("Failed to queue for sync");
 * }
 *
 * @example
 * // After payment event
 * const event = await createDebtPaymentEvent(payment, "create");
 * await addDebtEventToSyncQueue(event);
 */
export async function addDebtEventToSyncQueue(event: AnyDebtEvent): Promise<string | null> {
  try {
    const userId = await getCurrentUserId();

    // Build payload from event
    // The sync queue stores the event structure itself as the payload
    const payload = {
      id: event.id,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      op: event.op,
      payload: event.payload,
      idempotency_key: event.idempotency_key,
      lamport_clock: event.lamport_clock,
      vector_clock: event.vector_clock,
      actor_user_id: event.actor_user_id,
      device_id: event.device_id,
      timestamp: event.timestamp,
      created_at: event.created_at,
      household_id: event.household_id,
      event_version: event.event_version,
    };

    // Add to sync queue
    const result = await addToSyncQueue(
      event.entity_type as EntityType,
      event.entity_id,
      event.op,
      payload,
      userId
    );

    if (!result.success) {
      console.error("[Debt Sync] Failed to add to sync queue:", result.error);
      return null;
    }

    console.log(
      `[Debt Sync] Added to queue: ${event.entity_type} ${event.entity_id} (${event.op}) - Queue ID: ${result.queueItemId}`
    );

    return result.queueItemId || null;
  } catch (error) {
    console.error("[Debt Sync] Unexpected error adding to sync queue:", error);
    return null;
  }
}

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

    if (outstanding.length === 0) {
      return "synced";
    }

    // Most recent item wins
    outstanding.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const status = outstanding[0].status as SyncQueueStatus;

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
