/**
 * Sync Queue Operations for Manual Management
 *
 * Provides functions for manual sync queue management including:
 * - Retry individual failed items
 * - Discard problematic items
 * - Clear completed items
 *
 * All operations act on the LOCAL Dexie outbox (db.syncQueue); the sync
 * processor drains it to Supabase. These complement the automatic sync
 * processor and give users control over their pending changes.
 *
 * @module offline/syncQueueOperations
 */

import { db } from "@/lib/dexie/db";
import { syncProcessor } from "@/lib/sync/processor";

/**
 * Result type for sync queue operations
 */
export interface SyncQueueOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Retries a specific sync queue item by resetting its status and triggering sync.
 *
 * Process:
 * 1. Resets the item to "queued" with a fresh retry budget and no
 *    next_retry_at gate (due immediately)
 * 2. Triggers the sync processor to process it right away
 *
 * @param itemId - ID of the sync queue item to retry
 * @param userId - User ID (safety check against retrying another user's item)
 */
export async function retrySyncQueueItem(
  itemId: string,
  userId: string
): Promise<SyncQueueOperationResult> {
  try {
    const item = await db.syncQueue.get(itemId);

    if (!item) {
      return { success: false, error: "Queue item not found" };
    }

    if (item.user_id !== userId) {
      return { success: false, error: "Queue item belongs to another user" };
    }

    await db.syncQueue.update(itemId, {
      status: "queued",
      retry_count: 0,
      error_message: null,
      next_retry_at: null,
      updated_at: new Date().toISOString(),
    });

    // Trigger sync processor to immediately process this item
    try {
      await syncProcessor.processQueue(userId);
    } catch (syncError) {
      // Sync processor error is not critical - item is queued and will retry
      console.warn("Sync processor failed after retry reset:", syncError);
    }

    return { success: true };
  } catch (error) {
    console.error("Unexpected error retrying sync queue item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}

/**
 * Retries all failed sync queue items for the current user.
 *
 * Batch operation that resets all failed items to queued status and
 * triggers the sync processor. Useful when multiple items failed due to
 * a temporary outage.
 */
export async function retryAllFailedItems(
  userId: string
): Promise<SyncQueueOperationResult & { count?: number }> {
  try {
    const count = await db.syncQueue
      .where("status")
      .equals("failed")
      .filter((item) => item.user_id === userId)
      .modify({
        status: "queued",
        retry_count: 0,
        error_message: null,
        next_retry_at: null,
        updated_at: new Date().toISOString(),
      });

    // Trigger sync processor
    try {
      await syncProcessor.processQueue(userId);
    } catch (syncError) {
      console.warn("Sync processor failed after bulk retry:", syncError);
    }

    return { success: true, count };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}

/**
 * Discards a sync queue item by deleting it from the queue.
 *
 * WARNING: This permanently removes the queued change. The local change
 * may still exist in IndexedDB but will never sync to the server.
 *
 * @param itemId - ID of the sync queue item to discard
 * @param userId - User ID (safety check)
 */
export async function discardSyncQueueItem(
  itemId: string,
  userId: string
): Promise<SyncQueueOperationResult> {
  try {
    const item = await db.syncQueue.get(itemId);

    if (!item) {
      return { success: false, error: "Queue item not found" };
    }

    if (item.user_id !== userId) {
      return { success: false, error: "Queue item belongs to another user" };
    }

    await db.syncQueue.delete(itemId);

    return { success: true };
  } catch (error) {
    console.error("Unexpected error discarding sync queue item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}

/**
 * Clears all completed sync queue items for cleanup.
 *
 * Completed items are kept in the queue for a short time for observability
 * but can be safely deleted.
 */
export async function clearCompletedItems(
  userId: string
): Promise<SyncQueueOperationResult & { count?: number }> {
  try {
    const count = await db.syncQueue
      .where("status")
      .equals("completed")
      .filter((item) => item.user_id === userId)
      .delete();

    return { success: true, count };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}
