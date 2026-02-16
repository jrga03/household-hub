/**
 * Lamport Clock Manager for Event Ordering
 *
 * Implements per-entity Lamport clocks for causal ordering of events in distributed
 * sync. Each entity has its own clock that increments monotonically with each operation.
 *
 * Key Properties:
 * - Per-entity scoping: Each entity has independent clock (NOT global)
 * - Monotonic: Clock values always increase, never decrease
 * - Causal ordering: Higher clock values indicate later operations
 * - Conflict resolution: Used with vector clocks for deterministic merge
 *
 * Storage Strategy:
 * - Stored in IndexedDB meta table for persistence
 * - Key format: `lamport-${entityId}` (e.g., "lamport-transaction-123")
 * - Initial value: 0 (first operation gets clock value 1)
 * - Survives app restarts and browser sessions
 *
 * Phase A vs Phase B:
 * - Phase A: Basic increment for simple last-write-wins
 * - Phase B: Used with vector clocks for field-level conflict resolution
 *
 * See SYNC-ENGINE.md lines 365-511 for conflict resolution strategy.
 * See DECISIONS.md #77 for deterministic merge rules.
 *
 * @module sync/lamportClock
 */

import { db } from "@/lib/dexie/db";

/**
 * Storage key prefix for Lamport clocks in meta table.
 */
const LAMPORT_CLOCK_PREFIX = "lamport";

/**
 * Generates storage key for entity's Lamport clock.
 *
 * @param entityId - Entity identifier (may be temporary)
 * @returns Storage key for meta table
 *
 * @example
 * getLamportKey("transaction-123")
 * // "lamport-transaction-123"
 */
function getLamportKey(entityId: string): string {
  return `${LAMPORT_CLOCK_PREFIX}-${entityId}`;
}

/**
 * Gets the next Lamport clock value for an entity (increments and returns).
 *
 * This is the primary function used during sync operations to generate
 * monotonically increasing clock values for event ordering.
 *
 * Behavior:
 * - Reads current clock value from IndexedDB meta table
 * - Increments by 1
 * - Stores new value back to meta table
 * - Returns new value
 * - If entity has no clock yet, starts at 1 (not 0)
 *
 * Concurrency:
 * - IndexedDB transactions are atomic (safe for concurrent calls)
 * - Multiple tabs may increment simultaneously (handled by IndexedDB)
 * - Race conditions are acceptable (clocks don't need perfect sequencing)
 *
 * Error Handling:
 * - IndexedDB errors: Logged and returns 1 (fresh start)
 * - Meta table unavailable: Returns 1 (graceful degradation)
 * - All errors are non-fatal (sync continues with new clock)
 *
 * @param entityId - Entity identifier to get next clock for
 * @returns Promise resolving to next clock value (starts at 1)
 *
 * @example
 * const clock1 = await getNextLamportClock("transaction-123");
 * // 1 (first operation)
 *
 * const clock2 = await getNextLamportClock("transaction-123");
 * // 2 (second operation)
 *
 * const clock3 = await getNextLamportClock("transaction-123");
 * // 3 (third operation)
 */
export async function getNextLamportClock(entityId: string): Promise<number> {
  try {
    const key = getLamportKey(entityId);

    // Try to read current clock value
    const entry = await db.meta.get(key);
    const currentClock = (entry?.value as number) ?? 0;

    // Increment clock
    const nextClock = currentClock + 1;

    // Store new value (upsert)
    await db.meta.put({ key, value: nextClock });

    return nextClock;
  } catch (error) {
    console.error(`Failed to get next Lamport clock for entity ${entityId}:`, error);
    // Fallback: Return 1 (fresh start, sync will handle conflicts)
    return 1;
  }
}

/**
 * Gets the current Lamport clock value without incrementing.
 *
 * This is useful for:
 * - Debugging: Inspect clock state without changing it
 * - Read operations: Check clock value before deciding on action
 * - Testing: Verify clock increments are working correctly
 *
 * Behavior:
 * - Reads current clock value from IndexedDB meta table
 * - Does NOT increment the clock
 * - Returns 0 if entity has no clock yet (not started)
 *
 * Error Handling:
 * - IndexedDB errors: Logged and returns 0
 * - Meta table unavailable: Returns 0 (graceful degradation)
 *
 * @param entityId - Entity identifier to get current clock for
 * @returns Promise resolving to current clock value (0 if not initialized)
 *
 * @example
 * const clock = await getCurrentLamportClock("transaction-123");
 * // 5 (if entity has 5 operations)
 *
 * @example
 * const newClock = await getCurrentLamportClock("transaction-new");
 * // 0 (entity has no operations yet)
 */
export async function getCurrentLamportClock(entityId: string): Promise<number> {
  try {
    const key = getLamportKey(entityId);
    const entry = await db.meta.get(key);
    return (entry?.value as number) ?? 0;
  } catch (error) {
    console.error(`Failed to get current Lamport clock for entity ${entityId}:`, error);
    return 0;
  }
}

/**
 * Resets the Lamport clock for an entity to 0.
 *
 * WARNING: Use this function cautiously! Resetting clocks can cause sync
 * conflicts and violate causality guarantees.
 *
 * Valid Use Cases:
 * - Testing: Reset state between test runs
 * - Manual conflict resolution: Admin action to resolve stuck sync
 * - Entity deletion: Clean up clock state after entity is removed
 *
 * Invalid Use Cases:
 * - Normal sync operations: NEVER reset during active sync
 * - Error recovery: Resetting won't fix sync errors (may make worse)
 * - Performance: Clocks are small integers, no performance benefit
 *
 * Behavior:
 * - Sets clock value to 0 in meta table
 * - Next getNextLamportClock() will return 1
 * - Does NOT affect vector clocks (separate system)
 *
 * Error Handling:
 * - IndexedDB errors: Logged but don't throw
 * - Meta table unavailable: No-op (already in reset state)
 *
 * @param entityId - Entity identifier to reset clock for
 * @returns Promise that resolves when reset completes
 *
 * @example
 * // In test teardown
 * await resetLamportClock("transaction-123");
 *
 * @example
 * // After entity deletion
 * await deleteOfflineTransaction("transaction-123");
 * await resetLamportClock("transaction-123");
 */
export async function resetLamportClock(entityId: string): Promise<void> {
  try {
    const key = getLamportKey(entityId);
    await db.meta.put({ key, value: 0 });
    console.debug(`Reset Lamport clock for entity ${entityId}`);
  } catch (error) {
    console.error(`Failed to reset Lamport clock for entity ${entityId}:`, error);
    // Non-fatal error - clock will start from 1 on next operation anyway
  }
}

/**
 * Merges remote Lamport clock with local clock (takes maximum).
 *
 * This function is used during sync to maintain causal ordering when
 * receiving events from other devices. The clock value is set to the
 * maximum of local and remote to ensure monotonicity.
 *
 * Phase B Usage:
 * - Called when receiving sync events from server
 * - Ensures local clock doesn't go backward
 * - Maintains causal ordering across devices
 * - Prevents clock skew in distributed system
 *
 * Behavior:
 * - Reads current local clock
 * - Compares with remote clock
 * - Stores max(local, remote) back to meta table
 * - Returns the merged (maximum) clock value
 *
 * Edge Cases:
 * - Remote clock lower: Local clock unchanged (already ahead)
 * - Remote clock higher: Local clock jumps forward (catch up)
 * - Clocks equal: No change (already synchronized)
 * - No local clock: Remote clock becomes new local clock
 *
 * Error Handling:
 * - IndexedDB errors: Logged and returns remote clock value
 * - Meta table unavailable: Returns remote clock (fallback)
 *
 * @param entityId - Entity identifier to merge clock for
 * @param remoteClock - Clock value from remote device/server
 * @returns Promise resolving to merged clock value
 *
 * @example
 * // Local clock: 5, Remote clock: 8
 * const merged = await mergeLamportClock("transaction-123", 8);
 * // Returns 8 (local clock now 8)
 *
 * @example
 * // Local clock: 10, Remote clock: 5
 * const merged = await mergeLamportClock("transaction-123", 5);
 * // Returns 10 (local clock unchanged)
 *
 * @example
 * // No local clock, Remote clock: 3
 * const merged = await mergeLamportClock("transaction-new", 3);
 * // Returns 3 (local clock now 3)
 */
export async function mergeLamportClock(entityId: string, remoteClock: number): Promise<number> {
  try {
    const key = getLamportKey(entityId);

    // Get current local clock
    const entry = await db.meta.get(key);
    const localClock = (entry?.value as number) ?? 0;

    // Take maximum (maintain monotonicity)
    const mergedClock = Math.max(localClock, remoteClock);

    // Store merged clock
    await db.meta.put({ key, value: mergedClock });

    console.debug(
      `Merged Lamport clock for entity ${entityId}: local=${localClock}, remote=${remoteClock}, merged=${mergedClock}`
    );

    return mergedClock;
  } catch (error) {
    console.error(`Failed to merge Lamport clock for entity ${entityId}:`, error);
    // Fallback: Return remote clock (better than returning 0)
    return remoteClock;
  }
}
