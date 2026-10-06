/**
 * Debt Event Log
 *
 * Events are a local audit log written by `outbox.ts` with the queue item's
 * clock and idempotency key, never synced. This module reads that log and
 * computes update deltas.
 *
 * ## Event Structure
 *
 * - **Idempotency keys**: shared with the queue item that carries the same change
 * - **Lamport clocks**: taken from the queue item, so log order matches sync order
 * - **Delta events**: Update events store only changed fields, not full entity
 *
 * ## Key Patterns
 *
 * 1. **Written by outbox.ts**: the event and its queue item commit in one transaction
 * 2. **Delta Events**: Updates store only changed fields via calculateDelta()
 * 3. **Local only**: events are never pushed to Supabase
 *
 * @module debts/events
 */

import { db } from "@/lib/dexie/db";
import type { DebtEvent, InternalDebtEvent, DebtPaymentEvent, AnyDebtEvent } from "@/types/debt";

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
export function calculateDelta<T extends object>(before: T, after: T): Partial<T> {
  const delta: Partial<T> = {};

  // Union of keys from BOTH objects: a property REMOVED in `after` (e.g.
  // closed_at cleared via undefined) must still appear in the delta, which
  // an `after`-only iteration silently missed (review DEBT-12)
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof T & string>;

  for (const key of keys) {
    if (after[key] !== before[key]) {
      delta[key] = after[key];
    }
  }

  return delta;
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
  const existing = await db.events.where("idempotency_key").equals(idempotencyKey).first();
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
    .where("entity_id")
    .equals(debtId)
    .and((e) => e.entity_type === entityType)
    .sortBy("lamport_clock");

  return events as unknown as (DebtEvent | InternalDebtEvent)[];
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
    .where("entity_id")
    .equals(paymentId)
    .and((e) => e.entity_type === "debt_payment")
    .sortBy("lamport_clock");

  return events as unknown as DebtPaymentEvent[];
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
 * @param startTimestamp - Start timestamp (ISO 8601 string)
 * @param endTimestamp - End timestamp (ISO 8601 string)
 * @returns Promise resolving to array of events ordered by lamport clock
 *
 * @example
 * const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
 * const end = new Date().toISOString();
 * const events = await getDebtEventsInRange(start, end);
 * console.log(`${events.length} events in last 24 hours`);
 */
export async function getDebtEventsInRange(
  startTimestamp: string,
  endTimestamp: string
): Promise<AnyDebtEvent[]> {
  const events = await db.events
    .where("timestamp")
    .between(startTimestamp, endTimestamp, true, true)
    .and(
      (e) =>
        e.entity_type === "debt" ||
        e.entity_type === "internal_debt" ||
        e.entity_type === "debt_payment"
    )
    .sortBy("lamport_clock");

  return events as unknown as AnyDebtEvent[];
}
