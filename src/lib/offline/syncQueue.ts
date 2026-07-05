/**
 * Sync Queue: local Dexie outbox for offline changes
 *
 * The queue is the OUTBOX PATTERN done locally: every mutation writes its
 * entity AND a queue item into IndexedDB (ideally in one Dexie transaction),
 * and the sync processor drains the queue to Supabase when online. Enqueueing
 * never requires the network, so mutations succeed fully offline.
 *
 * (Historical note: this module previously INSERTed queue items into the
 * Supabase sync_queue table, which inverted the outbox pattern and made
 * offline mutations fail. See docs/reviews/2026-07-02-architecture-review.md
 * SYNC-01/02.)
 *
 * Sync Queue State Machine:
 * queued → syncing → completed
 *        ↓ (on error)
 *      queued (retryable, next_retry_at scheduled) or failed (permanent)
 *
 * "failed" is terminal: it is surfaced in the UI and only re-enters the
 * queue through an explicit user retry (retrySyncQueueItem).
 *
 * @module offline/syncQueue
 */

import { db } from "@/lib/dexie/db";
import { deviceManager } from "@/lib/dexie/deviceManager";
import { generateIdempotencyKey } from "@/lib/sync/idempotency";
import { getNextLamportClock } from "@/lib/sync/lamportClock";
import type { EntityType, OperationType, SyncQueueItem, SyncQueueOperation } from "@/types/sync";

/**
 * Default household ID for MVP (single household mode).
 * See DECISIONS.md #61 for multi-household architecture deferral.
 */
const DEFAULT_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000001";

/** Default number of retries before an item fails permanently. */
const DEFAULT_MAX_RETRIES = 3;

/**
 * Result type for sync queue operations.
 */
interface SyncQueueResult {
  success: boolean;
  error?: string;
  queueItemId?: string;
}

/**
 * Assembles a fully populated queue item WITHOUT writing it.
 *
 * Split from the enqueue so callers can generate the sync metadata (device
 * ID, clocks, idempotency key) BEFORE opening a Dexie transaction, then add
 * the item to db.syncQueue inside the same transaction as the entity write.
 * The metadata helpers touch db.meta / localStorage / (worst case)
 * FingerprintJS, none of which are safe inside a Dexie transaction zone.
 *
 * Throws on failure; addToSyncQueue wraps this for callers that want a
 * result object instead.
 */
export async function buildSyncQueueItem(
  entityType: EntityType,
  entityId: string,
  op: OperationType,
  payload: Record<string, unknown>,
  userId: string
): Promise<SyncQueueItem> {
  const deviceId = await deviceManager.getDeviceId();
  if (!deviceId) {
    throw new Error("Device ID unavailable");
  }

  const lamportClock = await getNextLamportClock(entityId);
  if (!lamportClock || lamportClock < 1 || !Number.isSafeInteger(lamportClock)) {
    throw new Error(`Invalid Lamport clock for entity ${entityId}: ${lamportClock}`);
  }

  const idempotencyKey = await generateIdempotencyKey(entityType, entityId, lamportClock);
  if (!idempotencyKey) {
    throw new Error("Idempotency key generation failed");
  }

  // Note: vector clocks are no longer minted here. The Phase B conflict
  // stack was removed as unreachable (review SYNC-05); Phase A resolves by
  // timestamp LWW, and the Lamport clock above is what idempotency needs.
  const operation: SyncQueueOperation = {
    op,
    payload,
    idempotencyKey,
    lamportClock,
  };

  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    household_id: DEFAULT_HOUSEHOLD_ID,
    entity_type: entityType,
    entity_id: entityId,
    operation,
    device_id: deviceId,
    user_id: userId,
    status: "queued",
    retry_count: 0,
    max_retries: DEFAULT_MAX_RETRIES,
    error_message: null,
    created_at: now,
    updated_at: now,
    synced_at: null,
    next_retry_at: null,
  };
}

/**
 * Adds an offline change to the local sync queue.
 *
 * Purely local: builds the item (clocks, idempotency key) and writes it to
 * IndexedDB. Never touches the network, so it succeeds offline.
 *
 * Callers that need the enqueue to be atomic with their entity write should
 * use buildSyncQueueItem() + db.syncQueue.add(item) inside their own
 * db.transaction instead of this convenience wrapper.
 *
 * @param entityType - Type of entity being modified
 * @param entityId - ID of entity (client-generated UUID)
 * @param op - Operation type (create, update, delete)
 * @param payload - Entity-specific data
 * @param userId - User ID from auth store
 */
export async function addToSyncQueue(
  entityType: EntityType,
  entityId: string,
  op: OperationType,
  payload: Record<string, unknown>,
  userId: string
): Promise<SyncQueueResult> {
  try {
    const item = await buildSyncQueueItem(entityType, entityId, op, payload, userId);
    await db.syncQueue.add(item);

    console.debug(`Queued for sync: ${entityType} ${entityId} (${op})`, {
      queueItemId: item.id,
      idempotencyKey: item.operation.idempotencyKey,
    });

    return { success: true, queueItemId: item.id };
  } catch (error) {
    console.error("Failed to add to sync queue:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Gets sync queue items that are due for processing.
 *
 * Returns "queued" items whose next_retry_at is unset or in the past, in
 * FIFO order. "failed" items are terminal and excluded; they only re-enter
 * via an explicit user retry.
 *
 * @param userId - Optional user filter (defaults to all local items; the
 *                 local DB is per-device, but a shared device could hold
 *                 items from a previous account)
 */
export async function getPendingQueueItems(userId?: string): Promise<SyncQueueItem[]> {
  try {
    const now = new Date().toISOString();

    const items = await db.syncQueue
      .where("status")
      .equals("queued")
      .filter(
        (item) =>
          (!item.next_retry_at || item.next_retry_at <= now) && (!userId || item.user_id === userId)
      )
      .toArray();

    // FIFO by creation time for causal ordering
    items.sort((a, b) => a.created_at.localeCompare(b.created_at));

    return items;
  } catch (error) {
    console.error("Failed to get pending queue items:", error);
    return [];
  }
}

/**
 * Gets everything not yet synced (queued, syncing, and failed items) for
 * queue-management UIs like SyncQueueViewer, newest last.
 */
export async function getOutstandingQueueItems(userId?: string): Promise<SyncQueueItem[]> {
  try {
    const items = await db.syncQueue
      .where("status")
      .anyOf("queued", "syncing", "failed")
      .filter((item) => !userId || item.user_id === userId)
      .toArray();

    items.sort((a, b) => a.created_at.localeCompare(b.created_at));

    return items;
  } catch (error) {
    console.error("Failed to get outstanding queue items:", error);
    return [];
  }
}

/**
 * Counts items waiting to sync (queued now or scheduled for retry).
 * Cheap local count; safe to poll or wrap in a liveQuery for badges.
 */
export async function getQueueCount(userId?: string): Promise<number> {
  try {
    return await db.syncQueue
      .where("status")
      .equals("queued")
      .filter((item) => !userId || item.user_id === userId)
      .count();
  } catch (error) {
    console.error("Failed to get queue count:", error);
    return 0;
  }
}

/**
 * Counts permanently failed items (surfaced in the sync issues UI).
 */
export async function getFailedCount(userId?: string): Promise<number> {
  try {
    return await db.syncQueue
      .where("status")
      .equals("failed")
      .filter((item) => !userId || item.user_id === userId)
      .count();
  } catch (error) {
    console.error("Failed to get failed queue count:", error);
    return 0;
  }
}

/**
 * Resets items stranded in "syncing" back to "queued".
 *
 * A tab crash between "mark syncing" and "mark completed/failed" previously
 * stranded items forever (review SYNC-08). Called at the start of each
 * processing session. Only items older than maxAgeMs are reset so an
 * actively syncing sibling tab is left alone.
 */
export async function resetStaleSyncingItems(maxAgeMs = 5 * 60 * 1000): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

    return await db.syncQueue
      .where("status")
      .equals("syncing")
      .filter((item) => item.updated_at <= cutoff)
      .modify({ status: "queued", updated_at: new Date().toISOString() });
  } catch (error) {
    console.error("Failed to reset stale syncing items:", error);
    return 0;
  }
}

/**
 * Deletes completed queue items older than the retention period.
 * Keeps recent completions around briefly for debugging/inspection.
 */
export async function cleanupCompletedItems(retentionDays = 7): Promise<number> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffISO = cutoff.toISOString();

    return await db.syncQueue
      .where("status")
      .equals("completed")
      .filter((item) => (item.synced_at ?? item.updated_at) < cutoffISO)
      .delete();
  } catch (error) {
    console.error("Failed to clean up completed queue items:", error);
    return 0;
  }
}
