/**
 * Sync Queue Operations for Offline Changes
 *
 * Implements the sync queue interface for tracking offline changes waiting to
 * sync to Supabase. Integrates idempotency keys, Lamport clocks, and vector
 * clocks for distributed sync and conflict resolution.
 *
 * Core Responsibilities:
 * - Add offline changes to sync queue (INSERT to Supabase)
 * - Query pending queue items for sync processor
 * - Track queue counts for UI badges and sync status
 *
 * Sync Queue State Machine:
 * queued → syncing → completed
 *        ↓ (on error)
 *      failed → queued (retry with exponential backoff)
 *
 * Key Patterns:
 * - Idempotency: Each operation gets unique key (deviceId-entityType-entityId-clock)
 * - Lamport Clock: Per-entity counter for ordering
 * - Vector Clock: Per-entity device map for conflict detection
 * - Graceful Errors: Return error objects, never throw
 *
 * See SYNC-ENGINE.md lines 227-277 for idempotency strategy.
 * See SYNC-ENGINE.md lines 365-511 for conflict resolution.
 * See instructions.md Step 4 for implementation details.
 *
 * @module offline/syncQueue
 */

import { supabase } from "@/lib/supabase";
import { deviceManager } from "@/lib/dexie/deviceManager";
import { generateIdempotencyKey } from "@/lib/sync/idempotency";
import { getNextLamportClock } from "@/lib/sync/lamportClock";
import { incrementVectorClock } from "@/lib/sync/vectorClock";
import type {
  EntityType,
  OperationType,
  SyncQueueOperation,
  SyncQueueItem,
  SyncQueueInsert,
} from "@/types/sync";

/**
 * Default household ID for MVP (single household mode).
 * See DECISIONS.md #61 for multi-household architecture deferral.
 */
const DEFAULT_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Result type for sync queue operations.
 */
interface SyncQueueResult {
  success: boolean;
  error?: string;
  queueItemId?: string;
}

/**
 * Adds an offline change to the sync queue.
 *
 * This is the core function called after every offline create/update/delete
 * operation. It generates all necessary sync metadata (idempotency key,
 * Lamport clock, vector clock) and inserts the change into the Supabase
 * sync_queue table with status "queued".
 *
 * Metadata Generation:
 * 1. Get device ID from deviceManager
 * 2. Increment Lamport clock for this entity (per-entity counter)
 * 3. Increment vector clock for this entity (per-entity per-device map)
 * 4. Generate idempotency key (deviceId-entityType-entityId-lamportClock)
 *
 * Queue Item Fields:
 * - id: Auto-generated UUID by Supabase
 * - household_id: Default MVP household (or explicit if provided)
 * - entity_type: Type of entity being synced
 * - entity_id: ID of entity (may be temporary like "temp-abc123")
 * - operation: {op, payload, idempotencyKey, lamportClock, vectorClock}
 * - device_id: Device that created this change
 * - user_id: User who owns this change (for RLS)
 * - status: "queued" (will be updated by sync processor)
 * - retry_count: 0 (incremented on retry)
 * - max_retries: 3 (configurable per operation)
 * - created_at: Auto-set by Supabase
 * - updated_at: Auto-set by trigger
 *
 * Error Handling:
 * - Device ID unavailable: Returns error (can't sync without device ID)
 * - Clock operations fail: Returns error (can't guarantee uniqueness)
 * - Supabase insert fails: Returns error with message
 * - Network offline: Returns error (queue item not created)
 * - All errors logged to console but don't throw
 *
 * @param entityType - Type of entity being modified
 * @param entityId - ID of entity (may be temporary)
 * @param op - Operation type (create, update, delete)
 * @param payload - Entity-specific data (varies by entity_type and operation)
 * @param userId - User ID from auth store (for RLS)
 * @returns Promise resolving to result with success status and error/queueItemId
 *
 * @example
 * // After creating offline transaction
 * const result = await addToSyncQueue(
 *   "transaction",
 *   "temp-abc123",
 *   "create",
 *   {
 *     date: "2025-10-27",
 *     description: "Grocery shopping",
 *     amount_cents: 150000,
 *     type: "expense",
 *     account_id: "checking-id",
 *     category_id: "groceries-id",
 *     status: "pending",
 *   },
 *   "user-123"
 * );
 *
 * if (result.success) {
 *   console.log("Queued for sync:", result.queueItemId);
 * }
 *
 * @example
 * // After updating offline transaction
 * const result = await addToSyncQueue(
 *   "transaction",
 *   "transaction-456",
 *   "update",
 *   {
 *     description: "Updated description",
 *     amount_cents: 200000,
 *   },
 *   "user-123"
 * );
 *
 * @example
 * // After deleting offline transaction
 * const result = await addToSyncQueue(
 *   "transaction",
 *   "transaction-789",
 *   "delete",
 *   {}, // No payload for delete
 *   "user-123"
 * );
 */
export async function addToSyncQueue(
  entityType: EntityType,
  entityId: string,
  op: OperationType,
  payload: Record<string, unknown>,
  userId: string
): Promise<SyncQueueResult> {
  try {
    // Step 1: Get device ID
    const deviceId = await deviceManager.getDeviceId();
    if (!deviceId) {
      console.error("Failed to get device ID for sync queue");
      return {
        success: false,
        error: "Device ID unavailable",
      };
    }

    // Step 2: Increment Lamport clock (per-entity counter)
    const lamportClock = await getNextLamportClock(entityId);
    const MAX_LAMPORT_CLOCK = Number.MAX_SAFE_INTEGER;
    if (!lamportClock || lamportClock < 1 || lamportClock > MAX_LAMPORT_CLOCK) {
      console.error(
        `Invalid Lamport clock value for entity ${entityId}: ${lamportClock} (expected 1 to ${MAX_LAMPORT_CLOCK})`
      );
      return {
        success: false,
        error: `Invalid Lamport clock: ${lamportClock}`,
      };
    }

    // Step 3: Increment vector clock (per-entity per-device map)
    const vectorClock = await incrementVectorClock(entityId);
    if (!vectorClock || Object.keys(vectorClock).length === 0) {
      console.error(`Failed to increment vector clock for entity ${entityId}`);
      return {
        success: false,
        error: "Vector clock unavailable",
      };
    }

    // Validate vector clock values (all must be positive integers)
    for (const [deviceIdKey, clockValue] of Object.entries(vectorClock)) {
      if (
        typeof clockValue !== "number" ||
        clockValue < 1 ||
        !Number.isInteger(clockValue) ||
        clockValue > MAX_LAMPORT_CLOCK
      ) {
        console.error(
          `Invalid vector clock value for device ${deviceIdKey}: ${clockValue} (expected positive integer)`
        );
        return {
          success: false,
          error: `Invalid vector clock value: ${clockValue} for device ${deviceIdKey}`,
        };
      }
    }

    // Step 4: Generate idempotency key
    const idempotencyKey = await generateIdempotencyKey(entityType, entityId, lamportClock);
    if (!idempotencyKey) {
      console.error("Failed to generate idempotency key");
      return {
        success: false,
        error: "Idempotency key generation failed",
      };
    }

    // Step 5: Build operation object
    const operation: SyncQueueOperation = {
      op,
      payload,
      idempotencyKey,
      lamportClock,
      vectorClock,
    };

    // Step 6: Build sync queue insert data
    const queueItem: SyncQueueInsert = {
      household_id: DEFAULT_HOUSEHOLD_ID,
      entity_type: entityType,
      entity_id: entityId,
      operation,
      device_id: deviceId,
      user_id: userId,
      status: "queued", // Initial state
      retry_count: 0,
      max_retries: 3, // Default: 3 attempts (configurable later)
    };

    // Step 7: Insert into Supabase sync_queue table
    const { data, error } = await supabase
      .from("sync_queue")
      .insert(queueItem)
      .select("id")
      .single();

    if (error) {
      console.error("Failed to insert sync queue item:", error);
      return {
        success: false,
        error: error.message || "Supabase insert failed",
      };
    }

    if (!data?.id) {
      console.error("Sync queue insert succeeded but no ID returned");
      return {
        success: false,
        error: "No queue item ID returned",
      };
    }

    // Success!
    console.debug(`Added to sync queue: ${entityType} ${entityId} (${op})`, {
      queueItemId: data.id,
      idempotencyKey,
      lamportClock,
      vectorClock,
    });

    return {
      success: true,
      queueItemId: data.id,
    };
  } catch (error) {
    console.error("Unexpected error adding to sync queue:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Gets all pending sync queue items for the current user and device.
 *
 * Retrieves queue items with status "queued" or "failed" that need to be
 * synced. Used by the sync processor to batch process offline changes.
 *
 * Query Strategy:
 * - Filter by user_id (RLS ensures only user's items visible)
 * - Filter by device_id (only sync this device's changes)
 * - Filter by status IN ("queued", "failed") (exclude syncing/completed)
 * - Order by created_at ascending (FIFO processing)
 * - No limit (return all pending items for batch processing)
 *
 * Status Types:
 * - "queued": Fresh items waiting for first sync attempt
 * - "failed": Items that failed previous sync and need retry
 * - Excludes "syncing": Currently being processed by sync processor
 * - Excludes "completed": Already synced successfully
 *
 * Error Handling:
 * - Device ID unavailable: Returns empty array (graceful degradation)
 * - Supabase query fails: Returns empty array with console error
 * - Network offline: Returns empty array (no pending items to fetch)
 * - All errors logged but don't throw
 *
 * @param userId - User ID from auth store (for RLS filtering)
 * @returns Promise resolving to array of pending queue items (empty on error)
 *
 * @example
 * const pending = await getPendingQueueItems("user-123");
 * console.log(`${pending.length} items pending sync`);
 *
 * for (const item of pending) {
 *   console.log(`${item.entity_type} ${item.entity_id}: ${item.operation.op}`);
 * }
 *
 * @example
 * // Empty result when offline or no pending items
 * const pending = await getPendingQueueItems("user-123");
 * // [] (empty array)
 */
export async function getPendingQueueItems(userId: string): Promise<SyncQueueItem[]> {
  try {
    // Get device ID for filtering
    const deviceId = await deviceManager.getDeviceId();
    if (!deviceId) {
      console.error("Failed to get device ID for pending queue items");
      return [];
    }

    // Query sync_queue for pending items
    const { data, error } = await supabase
      .from("sync_queue")
      .select("*")
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .in("status", ["queued", "failed"])
      .order("created_at", { ascending: true }); // FIFO processing

    if (error) {
      console.error("Failed to get pending queue items:", error);
      return [];
    }

    if (!data) {
      console.debug("No pending queue items found");
      return [];
    }

    console.debug(`Found ${data.length} pending queue items`);
    return data as SyncQueueItem[];
  } catch (error) {
    console.error("Unexpected error getting pending queue items:", error);
    return [];
  }
}

/**
 * Gets the count of pending sync queue items for the current user and device.
 *
 * Returns the number of items with status "queued" or "failed" that need to
 * be synced. Used for:
 * - UI badges (e.g., "3 items pending sync")
 * - Sync status indicators
 * - Deciding whether to trigger sync
 *
 * Query Strategy:
 * - Filter by user_id (RLS ensures only user's items visible)
 * - Filter by device_id (only count this device's changes)
 * - Filter by status IN ("queued", "failed")
 * - Use COUNT(*) for efficiency (no need to fetch full rows)
 *
 * Error Handling:
 * - Device ID unavailable: Returns 0 (graceful degradation)
 * - Supabase query fails: Returns 0 with console error
 * - Network offline: Returns 0 (assume no pending items)
 * - All errors logged but don't throw
 *
 * @param userId - User ID from auth store (for RLS filtering)
 * @returns Promise resolving to count of pending items (0 on error)
 *
 * @example
 * const count = await getQueueCount("user-123");
 * if (count > 0) {
 *   console.log(`You have ${count} changes waiting to sync`);
 * }
 *
 * @example
 * // Use for UI badge
 * const count = await getQueueCount("user-123");
 * return count > 0 ? `Sync (${count})` : "Sync";
 */
export async function getQueueCount(userId: string): Promise<number> {
  try {
    // Get device ID for filtering
    const deviceId = await deviceManager.getDeviceId();
    if (!deviceId) {
      console.error("Failed to get device ID for queue count");
      return 0;
    }

    // Query sync_queue for count only
    const { count, error } = await supabase
      .from("sync_queue")
      .select("*", { count: "exact", head: true }) // COUNT(*) only, no rows
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .in("status", ["queued", "failed"]);

    if (error) {
      console.error("Failed to get queue count:", error);
      return 0;
    }

    if (count === null) {
      console.debug("Queue count returned null");
      return 0;
    }

    console.debug(`Queue count: ${count} pending items`);
    return count;
  } catch (error) {
    console.error("Unexpected error getting queue count:", error);
    return 0;
  }
}
