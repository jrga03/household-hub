/**
 * Sync Queue Types
 *
 * Type definitions for the sync queue system that tracks offline changes
 * waiting to sync to the server.
 *
 * @see docs/implementation/chunks/022-sync-queue-schema/README.md
 * @see docs/initial plan/SYNC-ENGINE.md
 */

/**
 * Sync queue status states
 *
 * State machine flow:
 * queued → syncing → completed
 *        ↓ (on error)
 *      failed → queued (retry with exponential backoff)
 */
export type SyncQueueStatus = "queued" | "syncing" | "completed" | "failed";

/**
 * Entity types that can be synced
 *
 * These correspond to the main data tables in the system.
 * Includes debt-related entities for debt tracking feature.
 */
export type EntityType =
  | "transaction"
  | "account"
  | "category"
  | "budget"
  | "debt" // External debts (loans from outside household)
  | "internal_debt" // Internal debts (borrowing between household entities)
  | "debt_payment"; // Debt payment records

/**
 * Operation type for sync queue items
 *
 * Represents the type of change being synced.
 */
export type OperationType = "create" | "update" | "delete";

/**
 * Vector clock for conflict resolution
 *
 * Maps device IDs to their logical clock values.
 * Used in Phase B for field-level conflict resolution.
 *
 * @example
 * {
 *   "device-abc": 5,
 *   "device-xyz": 3
 * }
 */
export type VectorClock = Record<string, number>;

/**
 * Lamport clock value (monotonic counter per entity)
 *
 * Per-entity logical timestamp that increments with each event.
 * Provides total ordering of events within a single entity.
 */
export type LamportClock = number;

/**
 * Per-entity clock state stored in meta table
 *
 * Tracks both lamport and vector clocks for a specific entity.
 * Stored in Dexie meta table with key format: `clock:${entityId}`
 */
export interface EntityClockState {
  /** Entity ID this clock state belongs to */
  entityId: string;

  /** Current lamport clock value (monotonic counter) */
  lamportClock: number;

  /** Current vector clock (per-device counters) */
  vectorClock: VectorClock;

  /** Last update timestamp (ISO string) */
  updatedAt: string;
}

/**
 * Sync queue operation payload
 *
 * Contains the operation details and metadata needed for sync
 * and conflict resolution.
 */
export interface SyncQueueOperation {
  /** Operation type: create, update, or delete */
  op: OperationType;

  /**
   * Entity-specific data (varies by entity_type)
   *
   * Contains partial entity fields for the operation.
   * Structure depends on entity_type and operation type.
   */
  payload: Record<string, unknown>;

  /**
   * Idempotency key for duplicate detection
   *
   * Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
   *
   * @example "device-abc-transaction-temp-123-5"
   */
  idempotencyKey: string;

  /**
   * Lamport clock for ordering
   *
   * Per-entity counter incremented on each operation.
   * Used for ordering operations on the same entity and as the uniqueness
   * component of the idempotency key.
   */
  lamportClock: number;

  /**
   * Vector clock (Phase B only)
   *
   * No longer minted: the Phase A conflict stack was removed (review
   * SYNC-05). Optional so queue items written before the removal remain
   * valid. Phase B reintroduces this end-to-end.
   */
  vectorClock?: VectorClock;
}

/**
 * Sync queue item (local Dexie outbox row)
 *
 * Represents a single offline change waiting to sync. Lives in the local
 * db.syncQueue table; the sync processor drains it to Supabase.
 */
export interface SyncQueueItem {
  /** Unique identifier (UUID) */
  id: string;

  /**
   * Household scope (hardcoded for MVP - Decision #61)
   *
   * Always present - database provides default value.
   * Default: '00000000-0000-0000-0000-000000000001' (MVP household)
   */
  household_id: string;

  /** Type of entity being synced */
  entity_type: EntityType;

  /**
   * ID of entity being synced
   *
   * May be a temporary offline ID like "temp-abc123" before sync.
   * After successful sync, the sync processor remaps to server UUID.
   */
  entity_id: string;

  /** Operation details (JSONB in database) */
  operation: SyncQueueOperation;

  /** Device that created this queue item */
  device_id: string;

  /** User who owns this queue item (enables RLS policies) */
  user_id: string;

  /** Queue state */
  status: SyncQueueStatus;

  /** Number of sync attempts */
  retry_count: number;

  /** Maximum retry attempts before permanent failure */
  max_retries: number;

  /** Error message if sync failed */
  error_message: string | null;

  /** When the queue item was created */
  created_at: string;

  /** When the queue item was last updated (auto-updated by trigger) */
  updated_at: string;

  /** When sync completed successfully (enables cleanup) */
  synced_at: string | null;

  /**
   * Earliest time this item should be retried (ISO string).
   *
   * Set by the sync processor after a retryable failure using exponential
   * backoff. Null/undefined means the item is due immediately. Replaces the
   * old inline sleep, which stalled the whole queue without actually
   * retrying (review SYNC-09).
   */
  next_retry_at?: string | null;
}

/**
 * Sync queue insert data
 *
 * Fields required to create a new sync queue item.
 * Omits auto-generated fields (id, timestamps).
 */
export interface SyncQueueInsert {
  /**
   * Household scope (optional - defaults to MVP household)
   *
   * If omitted, database applies default: '00000000-0000-0000-0000-000000000001'
   */
  household_id?: string;

  /** Type of entity being synced */
  entity_type: EntityType;

  /** ID of entity being synced (may be temporary offline ID) */
  entity_id: string;

  /** Operation details */
  operation: SyncQueueOperation;

  /** Device that created this queue item */
  device_id: string;

  /** User who owns this queue item */
  user_id: string;

  /** Queue state (optional - defaults to 'queued') */
  status?: SyncQueueStatus;

  /** Number of sync attempts (optional - defaults to 0) */
  retry_count?: number;

  /** Maximum retry attempts (optional - defaults to 3) */
  max_retries?: number;

  /** Error message if sync failed */
  error_message?: string | null;
}

/**
 * Sync queue update data
 *
 * Fields that can be updated on a sync queue item.
 */
export interface SyncQueueUpdate {
  /** Queue state */
  status?: SyncQueueStatus;

  /** Number of sync attempts */
  retry_count?: number;

  /** Maximum retry attempts */
  max_retries?: number;

  /** Error message if sync failed */
  error_message?: string | null;

  /** When sync completed successfully */
  synced_at?: string | null;
}

/**
 * Sync queue filters
 *
 * Common filters for querying sync queue items.
 */
export interface SyncQueueFilters {
  /** Filter by status */
  status?: SyncQueueStatus;

  /** Filter by device ID */
  device_id?: string;

  /** Filter by entity type */
  entity_type?: EntityType;

  /** Filter by entity ID */
  entity_id?: string;

  /** Filter by user ID */
  user_id?: string;
}

// The Conflict/ConflictDetectionResult/ConflictStats/ClockComparison types
// were removed with the Phase B conflict stack (unreachable at runtime;
// review SYNC-05). Phase A resolves concurrent edits by timestamp LWW.
// Reintroduce alongside the end-to-end vector clock wiring in Phase B.
