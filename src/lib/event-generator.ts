/**
 * Event Generator for Offline-First Sync Engine
 *
 * Converts all CRUD mutations into immutable events for:
 * - Event sourcing audit trail
 * - Multi-device sync with conflict resolution
 * - Offline-first data integrity
 *
 * Key features:
 * - Deterministic idempotency keys (prevents duplicate processing)
 * - Per-entity Lamport clocks (causal ordering)
 * - Per-entity vector clocks (conflict detection)
 * - Payload checksums (integrity verification)
 * - Dual storage: IndexedDB (primary) + Supabase (secondary)
 *
 * Field mapping:
 * - TypeScript interface (TransactionEvent): camelCase
 * - Dexie schema (events table): snake_case
 * - Supabase (transaction_events table): snake_case
 *
 * See SYNC-ENGINE.md for architecture details.
 * See DECISIONS.md #62, #77 for conflict resolution strategy.
 *
 * @module lib/event-generator
 */

import { nanoid } from "nanoid";
import { db } from "./dexie/db";
import { supabase } from "./supabase";
import { deviceManager } from "./dexie/deviceManager";
import { idempotencyGenerator } from "./idempotency";
import { lamportClockManager } from "./vector-clock";
import type { EntityType, EventOp, TransactionEvent } from "@/types/event";

/**
 * Default household ID for MVP (single household mode).
 * See DECISIONS.md #59 for multi-household architecture (Phase 2+).
 */
const DEFAULT_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000001";

/**
 * EventGenerator creates immutable events for all entity mutations.
 *
 * Responsibilities:
 * - Generate deterministic idempotency keys
 * - Manage per-entity Lamport clocks
 * - Update per-entity vector clocks
 * - Calculate payload checksums
 * - Store events in Dexie (primary) and Supabase (secondary)
 * - Handle offline gracefully (warn, don't throw)
 *
 * Usage:
 * ```typescript
 * import { eventGenerator } from '@/lib/event-generator';
 *
 * const event = await eventGenerator.createEvent({
 *   entityType: 'transaction',
 *   entityId: 'tx-123',
 *   op: 'create',
 *   payload: { amount_cents: 100000, description: 'Groceries' },
 *   userId: 'user-456',
 * });
 * ```
 *
 * @class
 */
export class EventGenerator {
  /**
   * Create event for entity mutation.
   *
   * This method is the core of the event sourcing system. It:
   * 1. Gets the current device ID from DeviceManager
   * 2. Increments the Lamport clock for this specific entity (NOT global)
   * 3. Generates a deterministic idempotency key
   * 4. Calculates a checksum of the payload for integrity verification
   * 5. Gets or initializes the vector clock for this entity
   * 6. Creates the event object (camelCase fields)
   * 7. Stores in Dexie with snake_case field mapping
   * 8. Stores in Supabase with snake_case column mapping (best effort)
   *
   * Idempotency guarantees:
   * - Same mutation always generates same idempotency key
   * - Duplicate events are rejected at database level (unique constraint)
   * - Safe to retry failed operations without creating duplicates
   *
   * Offline behavior:
   * - Dexie storage is primary (blocks on failure)
   * - Supabase storage is secondary (warns on failure, doesn't throw)
   * - Sync queue (chunk 024) will retry Supabase sync later
   *
   * Error handling:
   * - Throws if Dexie storage fails (critical)
   * - Warns if Supabase storage fails (non-critical, will sync later)
   * - All errors include context for debugging
   *
   * @param params Event parameters
   * @param params.entityType Type of entity (transaction, account, category, budget)
   * @param params.entityId ID of the specific entity being mutated
   * @param params.op Operation type (create, update, delete)
   * @param params.payload Changed data (full object for create, delta for update)
   * @param params.userId ID of user performing the mutation
   * @returns Promise resolving to the created event
   * @throws Error if Dexie storage fails
   *
   * @example
   * const event = await eventGenerator.createEvent({
   *   entityType: 'transaction',
   *   entityId: 'tx-123',
   *   op: 'create',
   *   payload: { amount_cents: 100000, description: 'Groceries' },
   *   userId: 'user-456',
   * });
   */
  async createEvent(params: {
    entityType: EntityType;
    entityId: string;
    op: EventOp;
    payload: any;
    userId: string;
  }): Promise<TransactionEvent> {
    const { entityType, entityId, op, payload, userId } = params;

    // Get device ID (hybrid fallback: IndexedDB → localStorage → FingerprintJS → UUID)
    const deviceId = await deviceManager.getDeviceId();

    // Update vector clock for this entity (also increments lamport clock atomically)
    // Vector clocks are per-entity (not global) for fine-grained conflict detection
    const vectorClock = await lamportClockManager.updateVectorClock(entityId, deviceId);

    // Get the updated lamport clock for this specific entity (NOT global clock)
    // Lamport clocks are per-entity to avoid global coordination bottlenecks
    const lamportClock = await lamportClockManager.getCurrentLamportClock(entityId);

    // Generate deterministic idempotency key
    // Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
    // This ensures same mutation always generates same key (idempotent)
    const idempotencyKey = idempotencyGenerator.generateKey(
      deviceId,
      entityType,
      entityId,
      lamportClock
    );

    // Calculate checksum for payload integrity verification
    // Uses SHA-256 with normalized JSON (sorted keys, excluded timestamps)
    const checksum = await idempotencyGenerator.calculateChecksum(payload);

    // Create event object with camelCase fields (TypeScript interface)
    const event: TransactionEvent = {
      id: nanoid(),
      householdId: DEFAULT_HOUSEHOLD_ID, // MVP: Single household mode
      entityType,
      entityId,
      op,
      payload,
      timestamp: Date.now(), // Unix timestamp in milliseconds
      actorUserId: userId,
      deviceId,
      idempotencyKey,
      eventVersion: 1, // Schema version for forward compatibility
      lamportClock,
      vectorClock,
      checksum,
    };

    // Store in Dexie (primary storage - offline-first)
    // CRITICAL: Map camelCase → snake_case for Dexie schema
    try {
      await db.events.add({
        id: event.id,
        household_id: event.householdId,
        entity_type: event.entityType,
        entity_id: event.entityId,
        op: event.op,
        payload: event.payload,
        idempotency_key: event.idempotencyKey,
        event_version: event.eventVersion,
        actor_user_id: event.actorUserId,
        device_id: event.deviceId,
        lamport_clock: event.lamportClock,
        vector_clock: event.vectorClock,
        timestamp: new Date(event.timestamp).toISOString(), // Convert to ISO string for Dexie
      });
    } catch (error) {
      console.error("CRITICAL: Failed to store event in Dexie:", error);
      throw error; // Dexie failure is critical - blocks app
    }

    // Store in Supabase (secondary storage - cloud sync)
    // IMPORTANT: This is best-effort, failures are non-fatal
    try {
      const { error } = await supabase.from("transaction_events").insert({
        id: event.id,
        household_id: event.householdId,
        entity_type: event.entityType,
        entity_id: event.entityId,
        op: event.op,
        payload: event.payload,
        // NOTE: 'created_at' column uses DEFAULT NOW() on server side
        // We don't include timestamp here - server sets it automatically
        actor_user_id: event.actorUserId,
        device_id: event.deviceId,
        idempotency_key: event.idempotencyKey,
        event_version: event.eventVersion,
        lamport_clock: event.lamportClock,
        vector_clock: event.vectorClock,
        checksum: event.checksum,
      });

      if (error) {
        console.warn("Failed to store event in Supabase, will sync later:", error);
        // Event is in Dexie, sync queue (chunk 024) will retry
      }
    } catch (error) {
      console.warn("Failed to store event in Supabase, will sync later:", error);
      // Graceful degradation - app continues to work offline
    }

    return event;
  }

  /**
   * Calculate delta payload (only changed fields).
   *
   * For update operations, we only store the fields that changed
   * to minimize payload size and make conflict resolution easier.
   *
   * Comparison strategy:
   * - Uses strict equality (===) for primitive values
   * - Does NOT deep-compare objects or arrays (shallow comparison only)
   * - Treats undefined and null as different values
   *
   * Use cases:
   * - Update operations: Only send changed fields over network
   * - Conflict resolution: Apply field-level merge rules
   * - Audit trail: See exactly what changed in each update
   *
   * Edge cases:
   * - If all fields are identical: Returns empty object {}
   * - If newValue has fewer fields than oldValue: Only includes fields in newValue
   * - Timestamp fields (updated_at, created_at): Included in delta if changed
   *
   * @param oldValue Previous state of entity (before update)
   * @param newValue New state of entity (after update)
   * @returns Object containing only changed fields
   *
   * @example
   * const delta = eventGenerator.calculateDelta(
   *   { amount: 1000, description: "Old", status: "pending" },
   *   { amount: 2000, description: "Old", status: "cleared" }
   * );
   * // Returns: { amount: 2000, status: "cleared" }
   */
  calculateDelta(oldValue: any, newValue: any): any {
    const delta: any = {};

    // Iterate through all keys in new value
    for (const key in newValue) {
      // Only include fields that changed
      if (newValue[key] !== oldValue[key]) {
        delta[key] = newValue[key];
      }
    }

    return delta;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance of EventGenerator.
 *
 * Use this exported instance throughout the app for event creation.
 *
 * @example
 * import { eventGenerator } from '@/lib/event-generator';
 *
 * const event = await eventGenerator.createEvent({
 *   entityType: 'transaction',
 *   entityId: 'tx-123',
 *   op: 'create',
 *   payload: { amount_cents: 100000 },
 *   userId: 'user-456',
 * });
 */
export const eventGenerator = new EventGenerator();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Helper: Create event for transaction mutation.
 *
 * Convenience wrapper around eventGenerator.createEvent() with
 * entityType pre-filled to 'transaction'.
 *
 * @param op Operation type (create, update, delete)
 * @param transactionId Transaction ID
 * @param payload Transaction data (full for create, delta for update)
 * @param userId User performing the mutation
 * @returns Promise resolving to the created event
 *
 * @example
 * await createTransactionEvent(
 *   'create',
 *   'tx-123',
 *   { amount_cents: 100000, description: 'Groceries' },
 *   'user-456'
 * );
 */
export async function createTransactionEvent(
  op: EventOp,
  transactionId: string,
  payload: any,
  userId: string
): Promise<TransactionEvent> {
  return eventGenerator.createEvent({
    entityType: "transaction",
    entityId: transactionId,
    op,
    payload,
    userId,
  });
}

/**
 * Helper: Create event for account mutation.
 *
 * Convenience wrapper around eventGenerator.createEvent() with
 * entityType pre-filled to 'account'.
 *
 * @param op Operation type (create, update, delete)
 * @param accountId Account ID
 * @param payload Account data (full for create, delta for update)
 * @param userId User performing the mutation
 * @returns Promise resolving to the created event
 *
 * @example
 * await createAccountEvent(
 *   'update',
 *   'acc-123',
 *   { name: 'Savings Account' },
 *   'user-456'
 * );
 */
export async function createAccountEvent(
  op: EventOp,
  accountId: string,
  payload: any,
  userId: string
): Promise<TransactionEvent> {
  return eventGenerator.createEvent({
    entityType: "account",
    entityId: accountId,
    op,
    payload,
    userId,
  });
}

/**
 * Helper: Create event for category mutation.
 *
 * Convenience wrapper around eventGenerator.createEvent() with
 * entityType pre-filled to 'category'.
 *
 * @param op Operation type (create, update, delete)
 * @param categoryId Category ID
 * @param payload Category data (full for create, delta for update)
 * @param userId User performing the mutation
 * @returns Promise resolving to the created event
 *
 * @example
 * await createCategoryEvent(
 *   'delete',
 *   'cat-123',
 *   { deleted: true },
 *   'user-456'
 * );
 */
export async function createCategoryEvent(
  op: EventOp,
  categoryId: string,
  payload: any,
  userId: string
): Promise<TransactionEvent> {
  return eventGenerator.createEvent({
    entityType: "category",
    entityId: categoryId,
    op,
    payload,
    userId,
  });
}

/**
 * Helper: Create event for budget mutation.
 *
 * Convenience wrapper around eventGenerator.createEvent() with
 * entityType pre-filled to 'budget'.
 *
 * @param op Operation type (create, update, delete)
 * @param budgetId Budget ID
 * @param payload Budget data (full for create, delta for update)
 * @param userId User performing the mutation
 * @returns Promise resolving to the created event
 *
 * @example
 * await createBudgetEvent(
 *   'create',
 *   'bud-123',
 *   { category_id: 'cat-456', amount_cents: 50000, month_key: '2025-01' },
 *   'user-456'
 * );
 */
export async function createBudgetEvent(
  op: EventOp,
  budgetId: string,
  payload: any,
  userId: string
): Promise<TransactionEvent> {
  return eventGenerator.createEvent({
    entityType: "budget",
    entityId: budgetId,
    op,
    payload,
    userId,
  });
}
