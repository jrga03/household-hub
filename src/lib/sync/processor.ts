/**
 * Sync Processor - Process Offline Changes and Sync to Server
 *
 * Core responsibility: Process the sync queue (offline changes waiting to sync)
 * and execute operations against Supabase with retry logic and error handling.
 *
 * Key Features:
 * - Processes queue items in FIFO order (created_at ascending)
 * - Replaces temporary IDs with server UUIDs during sync
 * - Implements exponential backoff retry with max 3 attempts
 * - Classifies errors as retryable vs non-retryable
 * - Updates queue status through state machine transitions
 * - Prevents concurrent processing with isProcessing flag
 *
 * State Machine Flow:
 * queued → syncing → completed (success)
 *        ↓ (on error)
 *      failed (after 3 retries) OR queued (retry with backoff)
 *
 * Error Classification:
 * - Non-Retryable: Validation, constraints, syntax errors → fail immediately
 * - Retryable: Network, RLS, timeout errors → retry with exponential backoff
 *
 * ID Mapping Integration:
 * 1. Before sync: Replace temp IDs in payload (idMapping.replaceIds)
 * 2. After create: Store mapping (idMapping.add(tempId, serverId))
 * 3. After session: Clear mappings (idMapping.clear)
 *
 * Usage Pattern:
 * ```typescript
 * // Automatic sync (called by autoSyncManager)
 * const result = await syncProcessor.processQueue(userId);
 * console.log(`Synced: ${result.synced}, Failed: ${result.failed}`);
 *
 * // Manual sync (called by user button)
 * const { mutate } = useSyncProcessor();
 * mutate(); // Processes queue with toast notifications
 * ```
 *
 * See SYNC-ENGINE.md lines 176-224 for retry strategy.
 * See instructions.md Step 4 (lines 142-343) for implementation details.
 *
 * @module sync/processor
 */

import { supabase } from "@/lib/supabase";
import { getPendingQueueItems } from "@/lib/offline/syncQueue";
import { calculateRetryDelay, sleep } from "./retry";
import { idMapping } from "./idMapping";
import type { SyncQueueItem, EntityType } from "@/types/sync";

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
 * Result of sync create operation
 */
interface SyncCreateResult {
  /** Server-generated UUID for created entity */
  serverId?: string;
}

/**
 * Result of sync update/delete operations
 * Empty for now, but provides consistent interface for future extensions
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface SyncOperationResult {}

/**
 * SyncProcessor - Main class for processing offline sync queue
 *
 * Singleton pattern: Use exported `syncProcessor` instance.
 *
 * Thread-safety: isProcessing flag prevents concurrent sync operations.
 * This is safe in single-threaded JavaScript runtime.
 *
 * Error Handling Philosophy:
 * - Non-retryable errors (validation, constraints) fail immediately
 * - Retryable errors (network, RLS) retry up to MAX_RETRIES times
 * - All errors logged to console with context
 * - Queue status updated to reflect current state
 *
 * @class
 */
export class SyncProcessor {
  /**
   * Active processing promise (null when idle)
   * Used to prevent race conditions in concurrent processQueue calls
   * If multiple calls happen simultaneously, they all await the same promise
   */
  private processingPromise: Promise<{ synced: number; failed: number }> | null = null;

  /**
   * Maximum retry attempts before permanent failure
   * Each item can be retried this many times (4 total attempts including first try)
   */
  private readonly MAX_RETRIES = 3;

  /**
   * Process all pending queue items for a user
   *
   * Main entry point for sync operations. Called by:
   * - autoSyncManager: On visibility change, focus, online event, periodic timer
   * - useSyncProcessor: User-initiated manual sync button
   *
   * Processing Strategy:
   * 1. Check isProcessing flag (prevent concurrent syncs)
   * 2. Get pending items from sync_queue (status = "queued" or "failed")
   * 3. Process each item sequentially in FIFO order
   * 4. Track success/failure counts for reporting
   * 5. Clear ID mappings after session (finally block)
   *
   * Queue items are processed in order of created_at (ascending) to maintain
   * causal ordering. Items with earlier timestamps are synced first.
   *
   * ID Mapping Session:
   * - mappings accumulate during processing (temp ID → server UUID)
   * - cleared after session to prevent memory leaks
   * - mappings only valid within single sync session
   *
   * @param userId - User ID from auth store (for RLS filtering)
   * @returns Promise resolving to sync results with counts
   *
   * @example
   * // Automatic sync (background)
   * const result = await syncProcessor.processQueue("user-123");
   * if (result.synced > 0) {
   *   console.log(`Synced ${result.synced} items successfully`);
   * }
   * if (result.failed > 0) {
   *   console.error(`${result.failed} items failed to sync`);
   * }
   *
   * @example
   * // Manual sync with loading state
   * setIsLoading(true);
   * try {
   *   const result = await syncProcessor.processQueue(user.id);
   *   toast.success(`Synced ${result.synced} items`);
   * } finally {
   *   setIsLoading(false);
   * }
   */
  async processQueue(userId: string): Promise<{ synced: number; failed: number }> {
    // If already processing, return the existing promise (prevents race condition)
    if (this.processingPromise) {
      console.log("Sync already in progress - returning existing promise");
      return this.processingPromise;
    }

    // Create and store processing promise
    this.processingPromise = this.executeProcessing(userId);

    try {
      return await this.processingPromise;
    } finally {
      // Clear promise reference when complete
      this.processingPromise = null;
    }
  }

  /**
   * Internal method that performs the actual queue processing
   * Separated from processQueue() to enable atomic promise tracking
   *
   * @param userId - User ID from auth store
   * @returns Sync results with success/failure counts
   * @private
   */
  private async executeProcessing(userId: string): Promise<{ synced: number; failed: number }> {
    let synced = 0;
    let failed = 0;

    try {
      // Get all pending queue items (queued or failed status)
      const items = await getPendingQueueItems(userId);

      if (items.length === 0) {
        console.log("No pending queue items to process");
        return { synced: 0, failed: 0 };
      }

      console.log(`Processing ${items.length} queue items`);

      // Process each item sequentially
      for (const item of items) {
        const result = await this.processItem(item);
        if (result.success) {
          synced++;
        } else {
          failed++;
        }
      }

      console.log(`Sync complete: ${synced} synced, ${failed} failed`);
    } catch (error) {
      console.error("Unexpected error during queue processing:", error);
    } finally {
      // Always cleanup: clear ID mappings to prevent memory leaks
      idMapping.clear();
    }

    return { synced, failed };
  }

  /**
   * Process a single queue item
   *
   * Executes the operation (create/update/delete) and handles success/failure.
   *
   * Processing Steps:
   * 1. Update status to "syncing" (mark as in-progress)
   * 2. Replace temp IDs in payload (idMapping.replaceIds)
   * 3. Execute operation based on op type (create/update/delete)
   * 4. Store ID mapping if created entity (for future references)
   * 5. Update status to "completed" with synced_at timestamp
   *
   * Error Handling:
   * - Catch all errors and delegate to handleError
   * - handleError classifies error and decides retry strategy
   * - Returns success: false with error message on failure
   *
   * @param item - Sync queue item to process
   * @returns Promise resolving to result with success flag and optional error
   *
   * @example
   * // Process single item
   * const item = await getPendingQueueItems(userId)[0];
   * const result = await syncProcessor.processItem(item);
   * if (result.success) {
   *   console.log("Item synced successfully");
   * } else {
   *   console.error("Item failed:", result.error);
   * }
   */
  async processItem(item: SyncQueueItem): Promise<ProcessItemResult> {
    try {
      // Step 1: Update status to syncing
      await this.updateQueueStatus(item.id, "syncing");

      // Step 2: Replace temporary IDs in payload
      // This replaces any "temp-xxx" IDs with their server UUIDs
      const payload = idMapping.replaceIds(item.operation.payload);

      // Step 3: Execute operation based on type
      let result: SyncCreateResult | SyncOperationResult;
      switch (item.operation.op) {
        case "create":
          result = await this.syncCreate(item.entity_type, payload);
          break;
        case "update":
          result = await this.syncUpdate(item.entity_type, item.entity_id, payload);
          break;
        case "delete":
          result = await this.syncDelete(item.entity_type, item.entity_id);
          break;
        default:
          throw new Error(`Unknown operation: ${item.operation.op}`);
      }

      // Step 4: Store ID mapping if created new entity
      // This allows future operations to reference the server UUID
      if (item.operation.op === "create" && "serverId" in result && result.serverId) {
        idMapping.add(item.entity_id, result.serverId);
        console.log(`Mapped ${item.entity_id} → ${result.serverId}`);
      }

      // Step 5: Mark completed with timestamp
      await this.updateQueueStatus(item.id, "completed", null, new Date().toISOString());

      console.log(
        `Successfully processed queue item ${item.id} (${item.entity_type} ${item.operation.op})`
      );
      return { success: true };
    } catch (error) {
      console.error(`Failed to process queue item ${item.id}:`, error);
      return await this.handleError(item, error);
    }
  }

  /**
   * Sync CREATE operation to server
   *
   * Creates a new entity in Supabase and returns the server-generated UUID.
   * This UUID is stored in ID mapping for future references.
   *
   * Table Mapping:
   * - transaction → transactions
   * - account → accounts
   * - category → categories
   * - budget → budgets
   *
   * @param entityType - Type of entity to create
   * @param payload - Entity data (already has temp IDs replaced)
   * @returns Promise resolving to result with server UUID
   * @throws Error if insert fails (caught by processItem)
   *
   * @example
   * // Create transaction
   * const result = await syncCreate("transaction", {
   *   date: "2025-10-27",
   *   description: "Grocery shopping",
   *   amount_cents: 150000,
   *   type: "expense",
   *   account_id: "real-account-uuid", // Already replaced from temp ID
   *   category_id: "real-category-uuid",
   *   status: "pending",
   * });
   * // result.serverId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
   */
  private async syncCreate(
    entityType: EntityType,
    payload: Record<string, unknown>
  ): Promise<SyncCreateResult> {
    const tableName = this.getTableName(entityType);

    const { data, error } = await supabase.from(tableName).insert(payload).select("id").single();

    if (error) {
      throw error;
    }

    if (!data?.id) {
      throw new Error(`Create succeeded but no ID returned for ${tableName}`);
    }

    return { serverId: data.id };
  }

  /**
   * Sync UPDATE operation to server
   *
   * Updates an existing entity in Supabase by ID.
   * The entity_id should already be a real UUID (not a temp ID).
   *
   * @param entityType - Type of entity to update
   * @param entityId - Server UUID of entity (NOT temp ID)
   * @param payload - Fields to update (already has temp IDs replaced)
   * @returns Promise resolving to empty result object
   * @throws Error if update fails (caught by processItem)
   *
   * @example
   * // Update transaction description
   * await syncUpdate("transaction", "real-uuid-123", {
   *   description: "Updated description",
   *   amount_cents: 200000,
   * });
   */
  private async syncUpdate(
    entityType: EntityType,
    entityId: string,
    payload: Record<string, unknown>
  ): Promise<SyncOperationResult> {
    const tableName = this.getTableName(entityType);

    const { error } = await supabase.from(tableName).update(payload).eq("id", entityId);

    if (error) {
      throw error;
    }

    return {};
  }

  /**
   * Sync DELETE operation to server
   *
   * Deletes an entity from Supabase by ID.
   * The entity_id should already be a real UUID (not a temp ID).
   *
   * Note: Soft deletes (is_active = false) should use UPDATE, not DELETE.
   * Only use DELETE for actual row removal.
   *
   * @param entityType - Type of entity to delete
   * @param entityId - Server UUID of entity (NOT temp ID)
   * @returns Promise resolving to empty result object
   * @throws Error if delete fails (caught by processItem)
   *
   * @example
   * // Hard delete transaction
   * await syncDelete("transaction", "real-uuid-123");
   */
  private async syncDelete(entityType: EntityType, entityId: string): Promise<SyncOperationResult> {
    const tableName = this.getTableName(entityType);

    const { error } = await supabase.from(tableName).delete().eq("id", entityId);

    if (error) {
      throw error;
    }

    return {};
  }

  /**
   * Handle sync errors with retry logic
   *
   * Classifies errors into two categories:
   * 1. Non-Retryable: Validation, constraints, syntax → fail immediately
   * 2. Retryable: Network, RLS, timeout → retry with exponential backoff
   *
   * Non-Retryable Error Patterns:
   * - "violates check constraint" (amount_cents < 0, invalid date, etc.)
   * - "violates foreign key constraint" (invalid account_id, category_id)
   * - "violates unique constraint" (duplicate idempotency key)
   * - "invalid input syntax" (malformed UUID, invalid JSON)
   * - "value too long" (description > 500 chars)
   * - "invalid type" (string where number expected)
   *
   * Retry Strategy:
   * - Retry count < MAX_RETRIES: Sleep with exponential backoff, then retry
   * - Retry count >= MAX_RETRIES: Mark as failed permanently
   * - Exponential delays: ~1s, ~2s, ~4s (with jitter to prevent thundering herd)
   *
   * Status Updates:
   * - Non-retryable: status = "failed" (permanent)
   * - Max retries: status = "failed" (permanent)
   * - Retry: status = "queued", increment retry_count, store error_message
   *
   * @param item - Sync queue item that failed
   * @param error - Error that occurred during sync
   * @returns Promise resolving to result with success: false and error message
   *
   * @example
   * // Non-retryable error (constraint violation)
   * try {
   *   await syncCreate("transaction", { amount_cents: -100 });
   * } catch (error) {
   *   const result = await handleError(item, error);
   *   // result = { success: false, error: "violates check constraint..." }
   *   // item.status = "failed" (permanent)
   * }
   *
   * @example
   * // Retryable error (network timeout)
   * try {
   *   await syncCreate("transaction", payload);
   * } catch (error) {
   *   const result = await handleError(item, error);
   *   // Sleeps ~1s, then:
   *   // item.status = "queued", item.retry_count = 1
   *   // Next processQueue() call will retry
   * }
   */
  private async handleError(item: SyncQueueItem, error: unknown): Promise<ProcessItemResult> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if error is non-retryable (validation/constraint errors)
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

    // Check if max retries reached
    const retryCount = item.retry_count + 1;

    if (retryCount >= this.MAX_RETRIES) {
      console.log(
        `Max retries (${this.MAX_RETRIES}) reached for item ${item.id} - failing permanently`
      );
      await this.updateQueueStatus(item.id, "failed", errorMessage);
      return { success: false, error: `Max retries reached: ${errorMessage}` };
    }

    // Retry with exponential backoff
    const delay = calculateRetryDelay(retryCount);
    console.log(
      `Retrying item ${item.id} (attempt ${retryCount}/${this.MAX_RETRIES}) in ${Math.round(delay)}ms`
    );

    await sleep(delay);

    // Update retry count and status back to queued
    // Next processQueue() call will pick it up
    await supabase
      .from("sync_queue")
      .update({
        status: "queued",
        retry_count: retryCount,
        error_message: errorMessage,
      })
      .eq("id", item.id);

    return { success: false, error: errorMessage };
  }

  /**
   * Update sync queue item status
   *
   * Updates the status and optional metadata for a queue item.
   * Used to track item progress through the state machine.
   *
   * Status Transitions:
   * - queued → syncing: When processing starts
   * - syncing → completed: When operation succeeds
   * - syncing → failed: When operation fails (non-retryable or max retries)
   * - failed → queued: When retrying after delay
   *
   * @param id - Queue item UUID
   * @param status - New status value
   * @param errorMessage - Optional error message (for failed status)
   * @param syncedAt - Optional timestamp (for completed status)
   * @returns Promise resolving when update completes
   *
   * @example
   * // Mark as syncing
   * await updateQueueStatus(item.id, "syncing");
   *
   * @example
   * // Mark as completed
   * await updateQueueStatus(item.id, "completed", null, new Date().toISOString());
   *
   * @example
   * // Mark as failed
   * await updateQueueStatus(item.id, "failed", "Network timeout");
   */
  private async updateQueueStatus(
    id: string,
    status: "queued" | "syncing" | "completed" | "failed",
    errorMessage?: string | null,
    syncedAt?: string
  ): Promise<void> {
    const updates: Record<string, unknown> = { status };

    if (errorMessage !== undefined) {
      updates.error_message = errorMessage;
    }

    if (syncedAt !== undefined) {
      updates.synced_at = syncedAt;
    }

    const { error } = await supabase.from("sync_queue").update(updates).eq("id", id);

    if (error) {
      console.error(`Failed to update queue status for item ${id}:`, error);
      // Don't throw - this is a logging operation
    }
  }

  /**
   * Map entity type to Supabase table name
   *
   * Converts logical entity types to their corresponding database table names.
   *
   * Mapping:
   * - transaction → transactions
   * - account → accounts
   * - category → categories
   * - budget → budgets
   * - debt → debts
   * - internal_debt → internal_debts
   * - debt_payment → debt_payments
   *
   * @param entityType - Logical entity type
   * @returns Database table name
   *
   * @example
   * getTableName("transaction"); // "transactions"
   * getTableName("debt"); // "debts"
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
 * Use this exported instance throughout the application.
 * Do not create new instances - use the shared singleton.
 *
 * @example
 * import { syncProcessor } from '@/lib/sync/processor';
 *
 * // Process queue
 * const result = await syncProcessor.processQueue(userId);
 * console.log(`Synced ${result.synced} items`);
 */
export const syncProcessor = new SyncProcessor();
