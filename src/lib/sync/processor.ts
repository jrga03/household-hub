/**
 * Sync Processor - Drain the local outbox to Supabase
 *
 * Core responsibility: process the local Dexie sync queue (offline changes
 * waiting to sync) and execute operations against Supabase with retry
 * scheduling and error classification.
 *
 * Key Features:
 * - Reads the LOCAL db.syncQueue outbox (mutations enqueue there atomically)
 * - Processes queue items in FIFO order (created_at ascending)
 * - Client-generated UUIDs mean no ID remapping: local ID == server ID
 * - Retryable failures are rescheduled via next_retry_at (exponential
 *   backoff) instead of sleeping inline
 * - Items stranded in "syncing" by a crash are reset at session start
 * - Publishes progress to useSyncStore so all badges read one source
 *
 * State Machine Flow:
 * queued → syncing → completed (success)
 *        ↓ (on error)
 *      queued with next_retry_at (retryable) OR failed (permanent)
 *
 * Error Classification:
 * - Non-Retryable: Validation, constraints, syntax errors → fail immediately
 * - Retryable: Network, RLS, timeout errors → reschedule with backoff
 * - Duplicate primary key on create → treated as success (the previous
 *   attempt actually reached the server before we saw the response)
 *
 * @module sync/processor
 */

import { supabase } from "@/lib/supabase";
import { db } from "@/lib/dexie/db";
import {
  getPendingQueueItems,
  getQueueCount,
  resetStaleSyncingItems,
  cleanupCompletedItems,
} from "@/lib/offline/syncQueue";
import { calculateRetryDelay } from "./retry";
import { useSyncStore } from "@/stores/syncStore";
import type { SyncQueueItem, SyncQueueStatus, EntityType } from "@/types/sync";

/**
 * Result of processing a single queue item
 */
interface ProcessItemResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * SyncProcessor - Main class for draining the offline sync queue
 *
 * Singleton pattern: Use exported `syncProcessor` instance.
 *
 * Thread-safety: processingPromise dedupes concurrent calls within a tab.
 * Cross-tab overlap is tolerated because operations are idempotent
 * (duplicate-pkey creates are treated as success, updates are LWW,
 * deletes of missing rows are no-ops).
 *
 * @class
 */
export class SyncProcessor {
  /**
   * Active processing promise (null when idle)
   * If multiple calls happen simultaneously, they all await the same promise
   */
  private processingPromise: Promise<{ synced: number; failed: number }> | null = null;

  /**
   * Tracks whether executeProcessing is still actively running.
   * Prevents a new session from starting if a timed-out one is still in
   * flight (the timeout only rejects the caller's promise).
   */
  private isExecuting = false;

  /**
   * Maximum time (ms) before a processing session is considered stuck.
   */
  private readonly PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Process all due queue items.
   *
   * Main entry point for sync operations. Called by autoSyncManager
   * (online/focus/interval triggers) and useSyncProcessor (manual button).
   *
   * @param userId - User ID (items are stamped with their creator; filters
   *                 out items from another account on a shared device)
   */
  async processQueue(userId: string): Promise<{ synced: number; failed: number }> {
    // If already processing, return the existing promise (prevents race condition)
    if (this.processingPromise) {
      return this.processingPromise;
    }

    // Guard against starting a new session while a timed-out one is still executing
    if (this.isExecuting) {
      console.warn("Sync executor still running from timed-out session - skipping");
      return { synced: 0, failed: 0 };
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<{ synced: number; failed: number }>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Sync processing timed out after ${this.PROCESSING_TIMEOUT_MS}ms`));
      }, this.PROCESSING_TIMEOUT_MS);
    });

    this.processingPromise = Promise.race([this.executeProcessing(userId), timeoutPromise]);

    try {
      const result = await this.processingPromise;
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      console.error("Sync processing failed or timed out:", error);
      return { synced: 0, failed: 0 };
    } finally {
      this.processingPromise = null;
    }
  }

  /**
   * Internal method that performs the actual queue processing.
   */
  private async executeProcessing(userId: string): Promise<{ synced: number; failed: number }> {
    this.isExecuting = true;
    const store = useSyncStore.getState();
    let synced = 0;
    let failed = 0;

    try {
      // Recover items stranded in "syncing" by a previous crash (SYNC-08)
      await resetStaleSyncingItems();

      // Get all due queue items (queued, next_retry_at reached)
      const items = await getPendingQueueItems(userId);

      if (items.length === 0) {
        return { synced: 0, failed: 0 };
      }

      console.log(`Processing ${items.length} queue items`);
      store.setStatus("syncing");

      // Process each item sequentially (FIFO for causal ordering)
      for (const item of items) {
        const result = await this.processItem(item);
        if (result.success) {
          synced++;
        } else {
          failed++;
        }
      }

      console.log(`Sync complete: ${synced} synced, ${failed} failed`);

      if (synced > 0) {
        const now = new Date();
        store.setLastSyncTime(now);
        // Persist for reloads: useSyncStatus reads this via liveQuery
        await db.meta.put({ key: "lastSyncTime", value: now.toISOString() });
      }

      // Clean up old completed items to prevent unbounded growth
      await cleanupCompletedItems();
    } catch (error) {
      console.error("Unexpected error during queue processing:", error);
    } finally {
      this.isExecuting = false;

      // Publish final state for badges/banners (single source of truth)
      try {
        useSyncStore.getState().setPendingChanges(await getQueueCount(userId));
      } catch {
        // Non-fatal: badge count refresh only
      }
      useSyncStore
        .getState()
        .setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online");
    }

    return { synced, failed };
  }

  /**
   * Process a single queue item: mark syncing, execute the operation,
   * mark completed (or delegate to handleError).
   */
  async processItem(item: SyncQueueItem): Promise<ProcessItemResult> {
    try {
      await this.updateQueueStatus(item.id, "syncing");

      const payload = item.operation.payload;

      switch (item.operation.op) {
        case "create":
          await this.syncCreate(item.entity_type, payload);
          break;
        case "update":
          await this.syncUpdate(item.entity_type, item.entity_id, payload);
          break;
        case "delete":
          await this.syncDelete(item.entity_type, item.entity_id);
          break;
        default:
          throw new Error(`Unknown operation: ${item.operation.op}`);
      }

      await this.updateQueueStatus(item.id, "completed", null, new Date().toISOString());

      return { success: true };
    } catch (error) {
      console.error(`Failed to process queue item ${item.id}:`, error);
      return await this.handleError(item, error);
    }
  }

  /**
   * Sync CREATE operation to server.
   *
   * The payload carries a client-generated UUID as its id, which the server
   * keeps, so no ID mapping is needed. A duplicate-primary-key error means a
   * previous attempt already landed (e.g. we timed out after the server
   * committed) and is treated as success.
   */
  private async syncCreate(
    entityType: EntityType,
    payload: Record<string, unknown>
  ): Promise<void> {
    const tableName = this.getTableName(entityType);

    const { error } = await supabase.from(tableName).insert(payload);

    if (error) {
      const isDuplicatePkey = error.code === "23505" && error.message.includes("_pkey");
      if (isDuplicatePkey) {
        console.log(`${tableName} row already exists on server - treating create as synced`);
        return;
      }
      throw error;
    }
  }

  /**
   * Sync UPDATE operation to server.
   */
  private async syncUpdate(
    entityType: EntityType,
    entityId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const tableName = this.getTableName(entityType);

    const { error } = await supabase.from(tableName).update(payload).eq("id", entityId);

    if (error) {
      throw error;
    }
  }

  /**
   * Sync DELETE operation to server.
   *
   * Note: Soft deletes (is_active = false) should use UPDATE, not DELETE.
   * Deleting an already-missing row is a no-op on the server, which makes
   * retries idempotent.
   */
  private async syncDelete(entityType: EntityType, entityId: string): Promise<void> {
    const tableName = this.getTableName(entityType);

    const { error } = await supabase.from(tableName).delete().eq("id", entityId);

    if (error) {
      throw error;
    }
  }

  /**
   * Handle sync errors with retry scheduling.
   *
   * Non-retryable errors (validation/constraints) fail immediately and
   * permanently. Retryable errors are put back to "queued" with a
   * next_retry_at computed from exponential backoff, so the queue is never
   * stalled by an inline sleep and each item retries on its own schedule
   * across future sync sessions.
   *
   * Retry budget: an item's first attempt runs with retry_count 0; it fails
   * permanently once retry_count reaches max_retries (default 3 retries,
   * 4 total attempts).
   */
  private async handleError(item: SyncQueueItem, error: unknown): Promise<ProcessItemResult> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const nonRetryablePatterns = [
      "violates check constraint",
      "violates foreign key constraint",
      "violates unique constraint",
      "invalid input syntax",
      "value too long",
      "invalid type",
    ];

    const isNonRetryable = nonRetryablePatterns.some((pattern) =>
      errorMessage.toLowerCase().includes(pattern)
    );

    if (isNonRetryable) {
      console.log(`Non-retryable error for item ${item.id} - failing immediately:`, errorMessage);
      await this.updateQueueStatus(item.id, "failed", errorMessage);
      return { success: false, error: errorMessage };
    }

    if (item.retry_count >= item.max_retries) {
      console.log(
        `Max retries (${item.max_retries}) reached for item ${item.id} - failing permanently`
      );
      await this.updateQueueStatus(item.id, "failed", errorMessage);
      return { success: false, error: `Max retries reached: ${errorMessage}` };
    }

    // Schedule the retry instead of sleeping: the item becomes due again
    // once next_retry_at passes and a future sync session picks it up.
    const retryCount = item.retry_count + 1;
    const delay = calculateRetryDelay(retryCount);
    const nextRetryAt = new Date(Date.now() + delay).toISOString();

    console.log(
      `Scheduling retry for item ${item.id} (attempt ${retryCount}/${item.max_retries}) at ${nextRetryAt}`
    );

    await db.syncQueue.update(item.id, {
      status: "queued",
      retry_count: retryCount,
      error_message: errorMessage,
      next_retry_at: nextRetryAt,
      updated_at: new Date().toISOString(),
    });

    return { success: false, error: errorMessage };
  }

  /**
   * Update local sync queue item status.
   */
  private async updateQueueStatus(
    id: string,
    status: SyncQueueStatus,
    errorMessage?: string | null,
    syncedAt?: string
  ): Promise<void> {
    const updates: Partial<SyncQueueItem> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (errorMessage !== undefined) {
      updates.error_message = errorMessage;
    }

    if (syncedAt !== undefined) {
      updates.synced_at = syncedAt;
    }

    try {
      await db.syncQueue.update(id, updates);
    } catch (error) {
      console.error(`Failed to update queue status for item ${id}:`, error);
      // Don't throw - stale "syncing" rows are recovered by
      // resetStaleSyncingItems at the next session start
    }
  }

  /**
   * Map entity type to Supabase table name.
   */
  private getTableName(entityType: EntityType): string {
    const tableMap: Record<EntityType, string> = {
      transaction: "transactions",
      account: "accounts",
      category: "categories",
      budget: "budgets",
      debt: "debts",
      internal_debt: "internal_debts",
      debt_payment: "debt_payments",
    };
    return tableMap[entityType] || entityType;
  }
}

/**
 * Singleton instance of SyncProcessor
 *
 * @example
 * import { syncProcessor } from '@/lib/sync/processor';
 * const result = await syncProcessor.processQueue(userId);
 */
export const syncProcessor = new SyncProcessor();
