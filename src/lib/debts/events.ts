/**
 * Debt Event Generation for Event Sourcing
 *
 * This module creates events for all debt operations to enable:
 * - Complete audit trail (who changed what and when)
 * - Multi-device sync with conflict resolution
 * - Event replay for debugging and state reconstruction
 * - Compliance with financial record-keeping requirements
 *
 * ## Event Structure
 *
 * All events follow a consistent structure with:
 * - **Idempotency keys**: Prevent duplicate events (format: deviceId-entityType-entityId-lamportClock)
 * - **Lamport clocks**: Global monotonic counter for event ordering
 * - **Vector clocks**: Per-device counters for conflict detection
 * - **Delta events**: Update events store only changed fields, not full entity
 *
 * ## Key Patterns
 *
 * 1. **Idempotency Key Reuse**: Payment events reuse the payment's idempotency_key field
 * 2. **Delta Events**: Updates store only changed fields via calculateDelta()
 * 3. **Side Effect Pattern**: Events created after entity operations (eventual consistency)
 * 4. **Global Lamport Clock**: Single counter across all entity types
 *
 * @module debts/events
 */

import { nanoid } from "nanoid";
import { db } from "@/lib/dexie/db";
import { getDeviceId } from "@/lib/device";
import { getNextLamportClock } from "@/lib/dexie/lamport-clock";
import type {
  Debt,
  InternalDebt,
  DebtPayment,
  DebtEvent,
  InternalDebtEvent,
  DebtPaymentEvent,
  AnyDebtEvent,
} from "@/types/debt";

// =====================================================
// User Context (Placeholder)
// =====================================================

/**
 * Get current user ID from auth context
 *
 * TODO: Replace with actual Supabase auth integration
 * For now, returns a placeholder value
 *
 * Future implementation:
 * ```typescript
 * import { supabase } from '@/lib/supabase';
 * const { data: { user } } = await supabase.auth.getUser();
 * return user?.id || 'anonymous';
 * ```
 *
 * @returns Promise resolving to user ID
 */
async function getCurrentUserId(): Promise<string> {
  // Placeholder for MVP - replace with actual auth
  // This will be integrated with Supabase auth in future chunks
  return "user-placeholder";
}

// =====================================================
// Delta Calculation
// =====================================================

/**
 * Calculate delta between before and after states
 *
 * Returns only the fields that changed between two objects.
 * Used for update events to minimize event size and clarify intent.
 *
 * ## Why Delta Events?
 *
 * 1. **Smaller events**: 10-100x size reduction compared to full entity
 * 2. **Clearer intent**: See exactly what changed
 * 3. **Easier conflict resolution**: Field-level merge instead of entity-level
 *
 * @param before - Original object state
 * @param after - Updated object state
 * @returns Object containing only changed fields
 *
 * @example
 * const before = { name: "Old", status: "active", amount: 100 };
 * const after = { name: "New", status: "active", amount: 100 };
 * const delta = calculateDelta(before, after);
 * // Result: { name: "New" }
 */
export function calculateDelta<T extends Record<string, any>>(before: T, after: T): Partial<T> {
  const delta: Partial<T> = {};

  for (const key in after) {
    if (after[key] !== before[key]) {
      delta[key] = after[key];
    }
  }

  return delta;
}

// =====================================================
// Event Creation Functions
// =====================================================

/**
 * Create event for external debt operation
 *
 * Generates a complete event record with idempotency key, lamport clock,
 * vector clock, and stores it in the local events table.
 *
 * ## Idempotency Key Format
 *
 * ${deviceId}-debt-${debtId}-${lamportClock}
 *
 * This ensures:
 * - Unique keys per operation
 * - Monotonically increasing within device
 * - Server can deduplicate by key
 *
 * @param debt - Debt entity (full object for create, partial for update)
 * @param op - Operation type (create | update | delete)
 * @param changedFields - Changed fields for update operations (optional)
 * @returns Promise resolving to created event
 *
 * @example
 * // Create event
 * await createDebtEvent(newDebt, "create");
 *
 * // Update event with delta
 * const delta = calculateDelta(oldDebt, newDebt);
 * await createDebtEvent(newDebt, "update", delta);
 */
export async function createDebtEvent(
  debt: Debt,
  op: "create" | "update" | "delete",
  changedFields?: Partial<Debt>
): Promise<DebtEvent> {
  const deviceId = await getDeviceId();
  const lamportClock = await getNextLamportClock();
  const actorUserId = await getCurrentUserId();

  const idempotencyKey = `${deviceId}-debt-${debt.id}-${lamportClock}`;

  // Check if event already exists (idempotency)
  const existing = await db.events.where("idempotencyKey").equals(idempotencyKey).first();

  if (existing) {
    console.log(`[Event] Event with key ${idempotencyKey} already exists, skipping`);
    return existing as DebtEvent;
  }

  const event: DebtEvent = {
    id: nanoid(),
    entityType: "debt",
    entityId: debt.id,
    op,
    payload: op === "create" ? debt : changedFields || {},
    idempotencyKey,
    lamportClock,
    vectorClock: { [deviceId]: lamportClock },
    actorUserId,
    deviceId,
    timestamp: Date.now(),
    created_at: new Date().toISOString(),
  };

  await db.events.add(event);

  console.log(`[Event] Debt ${op} event created: ${debt.name} (lamport: ${lamportClock})`);

  return event;
}

/**
 * Create event for internal debt operation
 *
 * Same structure as createDebtEvent but for internal debt entity type.
 *
 * @param debt - Internal debt entity
 * @param op - Operation type (create | update | delete)
 * @param changedFields - Changed fields for update operations (optional)
 * @returns Promise resolving to created event
 *
 * @example
 * await createInternalDebtEvent(newDebt, "create");
 */
export async function createInternalDebtEvent(
  debt: InternalDebt,
  op: "create" | "update" | "delete",
  changedFields?: Partial<InternalDebt>
): Promise<InternalDebtEvent> {
  const deviceId = await getDeviceId();
  const lamportClock = await getNextLamportClock();
  const actorUserId = await getCurrentUserId();

  const idempotencyKey = `${deviceId}-internal_debt-${debt.id}-${lamportClock}`;

  // Check if event already exists (idempotency)
  const existing = await db.events.where("idempotencyKey").equals(idempotencyKey).first();

  if (existing) {
    console.log(`[Event] Event with key ${idempotencyKey} already exists, skipping`);
    return existing as InternalDebtEvent;
  }

  const event: InternalDebtEvent = {
    id: nanoid(),
    entityType: "internal_debt",
    entityId: debt.id,
    op,
    payload: op === "create" ? debt : changedFields || {},
    idempotencyKey,
    lamportClock,
    vectorClock: { [deviceId]: lamportClock },
    actorUserId,
    deviceId,
    timestamp: Date.now(),
    created_at: new Date().toISOString(),
  };

  await db.events.add(event);

  console.log(`[Event] Internal debt ${op} event created: ${debt.name} (lamport: ${lamportClock})`);

  return event;
}

/**
 * Create event for debt payment operation
 *
 * IMPORTANT: This function REUSES the payment's idempotency_key field
 * instead of generating a new one. This ensures:
 * - Single idempotency key per operation (not two)
 * - Payment processing and event sourcing stay in sync
 * - Server can deduplicate by single key
 *
 * @param payment - Debt payment entity (full object, always create operation)
 * @param op - Operation type (always "create" for payments)
 * @returns Promise resolving to created event
 *
 * @example
 * const payment = await processDebtPayment(...);
 * await createDebtPaymentEvent(payment, "create");
 */
export async function createDebtPaymentEvent(
  payment: DebtPayment,
  op: "create"
): Promise<DebtPaymentEvent> {
  const deviceId = await getDeviceId();
  const lamportClock = await getNextLamportClock();
  const actorUserId = await getCurrentUserId();

  // CRITICAL: Reuse payment's idempotency key (not generate new)
  const idempotencyKey = payment.idempotency_key;

  // Check if event already exists (idempotency)
  const existing = await db.events.where("idempotencyKey").equals(idempotencyKey).first();

  if (existing) {
    console.log(`[Event] Event with key ${idempotencyKey} already exists, skipping`);
    return existing as DebtPaymentEvent;
  }

  const event: DebtPaymentEvent = {
    id: nanoid(),
    entityType: "debt_payment",
    entityId: payment.id,
    op,
    payload: payment,
    idempotencyKey, // Reuses payment's key
    lamportClock,
    vectorClock: { [deviceId]: lamportClock },
    actorUserId,
    deviceId,
    timestamp: Date.now(),
    created_at: new Date().toISOString(),
  };

  await db.events.add(event);

  console.log(
    `[Event] Payment ${op} event created: ₱${(payment.amount_cents / 100).toFixed(2)} (lamport: ${lamportClock})`
  );

  return event;
}

// =====================================================
// Event Query Functions
// =====================================================

/**
 * Check if event with given idempotency key already exists
 *
 * Used to prevent duplicate event creation when operations are retried.
 *
 * @param idempotencyKey - Idempotency key to check
 * @returns Promise resolving to true if event exists, false otherwise
 *
 * @example
 * if (await eventExists(idempotencyKey)) {
 *   console.log("Event already created, skipping");
 *   return;
 * }
 */
export async function eventExists(idempotencyKey: string): Promise<boolean> {
  const existing = await db.events.where("idempotencyKey").equals(idempotencyKey).first();
  return existing !== undefined;
}

/**
 * Get all events for a specific debt
 *
 * Returns events ordered by lamport clock (chronological order).
 * Useful for audit trail and event replay.
 *
 * @param debtId - Debt ID to get events for
 * @param type - Debt type (external | internal)
 * @returns Promise resolving to array of events ordered by lamport clock
 *
 * @example
 * const events = await getDebtEvents("debt-123", "external");
 * // [create event, update event, archive event]
 */
export async function getDebtEvents(
  debtId: string,
  type: "external" | "internal"
): Promise<(DebtEvent | InternalDebtEvent)[]> {
  const entityType = type === "external" ? "debt" : "internal_debt";

  const events = await db.events
    .where("entityId")
    .equals(debtId)
    .and((e) => e.entityType === entityType)
    .sortBy("lamportClock");

  return events as (DebtEvent | InternalDebtEvent)[];
}

/**
 * Get all events for a specific debt payment
 *
 * Returns events ordered by lamport clock.
 * Typically only one event per payment (create only).
 *
 * @param paymentId - Payment ID to get events for
 * @returns Promise resolving to array of events ordered by lamport clock
 *
 * @example
 * const events = await getPaymentEvents("pay-123");
 * // [create event]
 */
export async function getPaymentEvents(paymentId: string): Promise<DebtPaymentEvent[]> {
  const events = await db.events
    .where("entityId")
    .equals(paymentId)
    .and((e) => e.entityType === "debt_payment")
    .sortBy("lamportClock");

  return events as DebtPaymentEvent[];
}

/**
 * Get all debt-related events within a time range
 *
 * Returns events for all debt entity types (debt, internal_debt, debt_payment)
 * within the specified timestamp range, ordered by lamport clock.
 *
 * Useful for:
 * - Debugging sync issues
 * - Generating activity reports
 * - Event compaction
 *
 * @param startTimestamp - Start timestamp (Unix milliseconds)
 * @param endTimestamp - End timestamp (Unix milliseconds)
 * @returns Promise resolving to array of events ordered by lamport clock
 *
 * @example
 * const start = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
 * const end = Date.now();
 * const events = await getDebtEventsInRange(start, end);
 * console.log(`${events.length} events in last 24 hours`);
 */
export async function getDebtEventsInRange(
  startTimestamp: number,
  endTimestamp: number
): Promise<AnyDebtEvent[]> {
  const events = await db.events
    .where("timestamp")
    .between(startTimestamp, endTimestamp, true, true)
    .and(
      (e) =>
        e.entityType === "debt" ||
        e.entityType === "internal_debt" ||
        e.entityType === "debt_payment"
    )
    .sortBy("lamportClock");

  return events as AnyDebtEvent[];
}
