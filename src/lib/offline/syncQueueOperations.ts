/**
 * Sync Queue Operations for Manual Management
 *
 * Provides functions for manual sync queue management including:
 * - Retry individual failed items
 * - Discard problematic items
 * - Reset retry counts
 *
 * These operations complement the automatic sync processor and give users
 * control over their pending changes.
 *
 * @module offline/syncQueueOperations
 */

import { supabase } from "@/lib/supabase";
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
 * This is useful when a single item fails and the user wants to retry it
 * without waiting for the automatic retry interval.
 *
 * Process:
 * 1. Updates the item's status from "failed" to "queued"
 * 2. Resets retry_count to 0 (gives it fresh retry attempts)
 * 3. Triggers the sync processor to immediately process the item
 *
 * @param itemId - ID of the sync queue item to retry
 * @param userId - User ID for RLS filtering
 * @returns Promise resolving to operation result
 *
 * @example
 * const result = await retrySyncQueueItem("queue-item-123", "user-456");
 * if (result.success) {
 *   toast.success("Retry initiated");
 * }
 */
export async function retrySyncQueueItem(
  itemId: string,
  userId: string
): Promise<SyncQueueOperationResult> {
  try {
    // Update item status to queued and reset retry count
    const { error: updateError } = await supabase
      .from("sync_queue")
      .update({
        status: "queued",
        retry_count: 0,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("user_id", userId); // RLS safety check

    if (updateError) {
      console.error("Failed to update sync queue item:", updateError);
      return {
        success: false,
        error: updateError.message || "Failed to update item status",
      };
    }

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
 * triggers sync processor. Useful when multiple items fail due to
 * temporary network issues.
 *
 * @param userId - User ID for RLS filtering
 * @returns Promise resolving to operation result with count
 *
 * @example
 * const result = await retryAllFailedItems("user-456");
 * toast.success(`Retrying ${result.count} items`);
 */
export async function retryAllFailedItems(
  userId: string
): Promise<SyncQueueOperationResult & { count?: number }> {
  try {
    const { data, error: updateError } = await supabase
      .from("sync_queue")
      .update({
        status: "queued",
        retry_count: 0,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "failed")
      .select("id");

    if (updateError) {
      return {
        success: false,
        error: updateError.message || "Failed to update items",
      };
    }

    const count = data?.length || 0;

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
 * Use cases:
 * - Item is stuck and blocking other syncs
 * - User realizes the change was a mistake
 * - Conflict cannot be resolved and user chooses to abandon the change
 *
 * Safety:
 * - Requires user confirmation before calling
 * - Only deletes from sync_queue (doesn't touch IndexedDB)
 * - Cannot be undone
 *
 * @param itemId - ID of the sync queue item to discard
 * @param userId - User ID for RLS filtering
 * @returns Promise resolving to operation result
 *
 * @example
 * if (confirm("Discard this change? Cannot be undone.")) {
 *   const result = await discardSyncQueueItem("queue-item-123", "user-456");
 * }
 */
export async function discardSyncQueueItem(
  itemId: string,
  userId: string
): Promise<SyncQueueOperationResult> {
  try {
    const { error: deleteError } = await supabase
      .from("sync_queue")
      .delete()
      .eq("id", itemId)
      .eq("user_id", userId); // RLS safety check

    if (deleteError) {
      console.error("Failed to delete sync queue item:", deleteError);
      return {
        success: false,
        error: deleteError.message || "Failed to delete item",
      };
    }

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
 * but can be safely deleted. This helps keep the queue table size manageable.
 *
 * @param userId - User ID for RLS filtering
 * @returns Promise resolving to operation result with count
 */
export async function clearCompletedItems(
  userId: string
): Promise<SyncQueueOperationResult & { count?: number }> {
  try {
    const { data, error } = await supabase
      .from("sync_queue")
      .delete()
      .eq("user_id", userId)
      .eq("status", "completed")
      .select("id");

    if (error) {
      return {
        success: false,
        error: error.message || "Failed to clear completed items",
      };
    }

    return { success: true, count: data?.length || 0 };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    };
  }
}
