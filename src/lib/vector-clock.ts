/**
 * Vector Clock Utilities for Household Hub Sync Engine
 *
 * Implements per-entity vector clocks for distributed conflict detection and
 * Lamport clocks for causal ordering. Vector clocks track logical time across
 * multiple devices to detect concurrent modifications (conflicts).
 *
 * Key Concepts:
 * - Vector Clock: Maps device IDs to logical clock values {deviceId: number}
 * - Lamport Clock: Per-entity monotonic counter for total ordering
 * - Causality: Vector clocks capture "happened-before" relationships
 * - Conflict Detection: "concurrent" comparison result = conflict exists
 *
 * Design:
 * - Per-entity clocks (NOT global) to reduce contention
 * - Element-wise maximum merge for commutative/idempotent operations
 * - Deterministic comparison for consistent conflict detection
 * - Meta table storage for persistent clock state
 *
 * Performance:
 * - Clock comparison: O(D) where D = device count (typically 2-5)
 * - Clock storage: ~50 bytes per entity in meta table
 * - Negligible overhead for typical household usage
 *
 * @see docs/initial plan/SYNC-ENGINE.md (lines 340-362 for comparison algorithm)
 * @see docs/implementation/chunks/031-vector-clocks/instructions.md
 * @module lib/vector-clock
 */

import type { VectorClock, ClockComparison } from "@/types/sync";
import { db } from "@/lib/dexie/db";

// ============================================================================
// Vector Clock Utility Functions
// ============================================================================

/**
 * Compare two vector clocks to determine causality relationship
 *
 * Implements the canonical vector clock comparison algorithm:
 * - concurrent: Both clocks have events the other doesn't (CONFLICT!)
 * - local-ahead: v1 has all v2's events plus more (no conflict)
 * - remote-ahead: v2 has all v1's events plus more (no conflict)
 * - equal: All clock values are identical (same version)
 *
 * Algorithm:
 * 1. Collect all device IDs from both clocks
 * 2. For each device, compare clock values (missing = 0)
 * 3. Track if v1 has any higher values AND if v2 has any higher values
 * 4. Interpret: both ahead = concurrent, one ahead = ordered, neither = equal
 *
 * @param v1 - Local vector clock
 * @param v2 - Remote vector clock
 * @returns Comparison result indicating causality relationship
 *
 * @example
 * // Device A edits, then Device B edits (sequential)
 * const v1 = { deviceA: 5, deviceB: 3 };
 * const v2 = { deviceA: 3, deviceB: 2 };
 * compareVectorClocks(v1, v2); // "local-ahead" (no conflict)
 *
 * @example
 * // Device A and Device B edit concurrently (conflict!)
 * const v1 = { deviceA: 5, deviceB: 2 };
 * const v2 = { deviceA: 3, deviceB: 4 };
 * compareVectorClocks(v1, v2); // "concurrent" (CONFLICT!)
 */
export function compareVectorClocks(v1: VectorClock, v2: VectorClock): ClockComparison {
  // Get all devices from both clocks (union of keys)
  const devices = new Set([...Object.keys(v1), ...Object.keys(v2)]);

  let v1Ahead = false;
  let v2Ahead = false;

  // Check each device's clock value
  for (const device of devices) {
    const t1 = v1[device] || 0; // Missing device = clock value 0
    const t2 = v2[device] || 0;

    if (t1 > t2) {
      v1Ahead = true; // v1 has events v2 doesn't
    }
    if (t2 > t1) {
      v2Ahead = true; // v2 has events v1 doesn't
    }
  }

  // Interpret results based on which clock(s) are ahead
  if (v1Ahead && v2Ahead) {
    // Both clocks have events the other doesn't → concurrent edits (CONFLICT!)
    return "concurrent";
  }
  if (v1Ahead) {
    // v1 has all of v2's events plus more → v1 ahead (no conflict)
    return "local-ahead";
  }
  if (v2Ahead) {
    // v2 has all of v1's events plus more → v2 ahead (no conflict)
    return "remote-ahead";
  }

  // All clock values equal → same version (no conflict)
  return "equal";
}

/**
 * Merge two vector clocks by taking element-wise maximum
 *
 * Creates a new clock that dominates both input clocks by taking
 * the maximum value for each device. This operation is:
 * - Commutative: merge(v1, v2) = merge(v2, v1)
 * - Idempotent: merge(v, v) = v
 * - Associative: merge(merge(v1, v2), v3) = merge(v1, merge(v2, v3))
 *
 * Use cases:
 * - Syncing remote vector clock with local
 * - Resolving conflicts by creating merged state
 * - Updating entity clock after remote sync
 *
 * @param v1 - First vector clock
 * @param v2 - Second vector clock
 * @returns Merged vector clock with max values for each device
 *
 * @example
 * const local = { deviceA: 5, deviceB: 3 };
 * const remote = { deviceA: 3, deviceB: 7, deviceC: 2 };
 * mergeVectorClocks(local, remote);
 * // { deviceA: 5, deviceB: 7, deviceC: 2 }
 */
export function mergeVectorClocks(v1: VectorClock, v2: VectorClock): VectorClock {
  const merged: VectorClock = {};
  const devices = new Set([...Object.keys(v1), ...Object.keys(v2)]);

  for (const device of devices) {
    merged[device] = Math.max(v1[device] || 0, v2[device] || 0);
  }

  return merged;
}

/**
 * Increment vector clock for the current device
 *
 * Creates a new clock with the device's counter incremented by 1.
 * All other device counters are preserved unchanged.
 *
 * This is the fundamental operation for recording a local event.
 * Call this when:
 * - Creating a new entity
 * - Updating an existing entity
 * - Deleting an entity
 *
 * @param clock - Current vector clock
 * @param deviceId - Device making the change
 * @returns Updated vector clock with incremented device value
 *
 * @example
 * const clock = { deviceA: 5, deviceB: 3 };
 * incrementVectorClock(clock, "deviceA");
 * // { deviceA: 6, deviceB: 3 }
 *
 * @example
 * // First event from new device
 * const clock = { deviceA: 5 };
 * incrementVectorClock(clock, "deviceB");
 * // { deviceA: 5, deviceB: 1 }
 */
export function incrementVectorClock(clock: VectorClock, deviceId: string): VectorClock {
  return {
    ...clock,
    [deviceId]: (clock[deviceId] || 0) + 1,
  };
}

/**
 * Create a new vector clock for a device
 *
 * Initializes a fresh vector clock with the specified device at clock value 1.
 * Used when creating the first event for a new entity.
 *
 * @param deviceId - Device ID
 * @returns New vector clock with device at 1
 *
 * @example
 * createVectorClock("device-abc123");
 * // { "device-abc123": 1 }
 */
export function createVectorClock(deviceId: string): VectorClock {
  return { [deviceId]: 1 };
}

/**
 * Check if a vector clock is empty
 *
 * Returns true if the clock has no device entries.
 * Empty clocks indicate an entity with no events yet.
 *
 * @param clock - Vector clock to check
 * @returns True if clock has no entries
 *
 * @example
 * isEmptyVectorClock({}); // true
 * isEmptyVectorClock({ deviceA: 1 }); // false
 */
export function isEmptyVectorClock(clock: VectorClock): boolean {
  return Object.keys(clock).length === 0;
}

/**
 * Serialize vector clock to JSON string for storage
 *
 * Converts the clock object to a JSON string suitable for:
 * - Storing in IndexedDB meta table
 * - Sending over network in sync events
 * - Persisting in Supabase JSONB columns
 *
 * @param clock - Vector clock to serialize
 * @returns JSON string representation
 *
 * @example
 * const clock = { deviceA: 5, deviceB: 3 };
 * serializeVectorClock(clock);
 * // '{"deviceA":5,"deviceB":3}'
 */
export function serializeVectorClock(clock: VectorClock): string {
  return JSON.stringify(clock);
}

/**
 * Deserialize vector clock from JSON string
 *
 * Parses a JSON string back into a vector clock object.
 * Returns empty clock {} if parsing fails (graceful degradation).
 *
 * @param serialized - JSON string of vector clock
 * @returns Parsed vector clock object (empty {} on parse error)
 *
 * @example
 * deserializeVectorClock('{"deviceA":5,"deviceB":3}');
 * // { deviceA: 5, deviceB: 3 }
 *
 * @example
 * // Graceful error handling
 * deserializeVectorClock('invalid json');
 * // {} (empty clock)
 */
export function deserializeVectorClock(serialized: string): VectorClock {
  try {
    return JSON.parse(serialized) as VectorClock;
  } catch {
    // Return empty clock on parse error (graceful degradation)
    return {};
  }
}

/**
 * Get maximum clock value across all devices
 *
 * Returns the highest clock value among all devices in the vector clock.
 * Useful for:
 * - Estimating total event count across devices
 * - Finding the most recent device edit
 * - Debugging clock progression
 *
 * @param clock - Vector clock
 * @returns Maximum clock value (0 for empty clocks)
 *
 * @example
 * const clock = { deviceA: 5, deviceB: 3, deviceC: 8 };
 * getMaxClockValue(clock); // 8
 *
 * @example
 * getMaxClockValue({}); // 0 (empty clock)
 */
export function getMaxClockValue(clock: VectorClock): number {
  const values = Object.values(clock);
  return values.length > 0 ? Math.max(...values) : 0;
}

// ============================================================================
// Lamport Clock Manager
// ============================================================================

/**
 * Lamport clock manager for per-entity monotonic counters
 *
 * Manages both Lamport clocks (monotonic counters) and vector clocks
 * for each entity in the system. Clock state is persisted in the Dexie
 * meta table with key format: `clock:${entityId}`
 *
 * Clock State Storage Format:
 * ```typescript
 * {
 *   key: "clock:tx-123",
 *   value: {
 *     lamportClock: 5,
 *     vectorClock: { deviceA: 3, deviceB: 2 },
 *     updatedAt: "2024-01-15T10:30:00.000Z"
 *   }
 * }
 * ```
 *
 * Usage Pattern:
 * 1. Get next Lamport clock when creating event
 * 2. Update vector clock for this device
 * 3. Include both clocks in event payload
 * 4. After sync, merge remote vector clock with local
 *
 * @example
 * // Create event with clocks
 * const lamportClock = await lamportClockManager.getNextLamportClock("tx-123");
 * const vectorClock = await lamportClockManager.updateVectorClock("tx-123", deviceId);
 *
 * @example
 * // Merge remote clock after sync
 * await lamportClockManager.mergeVectorClock("tx-123", remoteVectorClock);
 */
export class LamportClockManager {
  /**
   * Get current lamport clock for an entity
   *
   * Returns the current Lamport clock value without incrementing.
   * Returns 0 if no clock state exists for the entity.
   *
   * @param entityId - Entity identifier
   * @returns Current lamport clock value (0 if not found)
   *
   * @example
   * await getCurrentLamportClock("tx-123"); // 5
   */
  async getCurrentLamportClock(entityId: string): Promise<number> {
    // Check meta table for stored clock state
    const state = await db.meta.get(`clock:${entityId}`);
    const clockState = state?.value as
      | { lamportClock?: number; vectorClock?: Record<string, number> }
      | undefined;
    return clockState?.lamportClock || 0;
  }

  /**
   * Get next lamport clock value (increment and persist)
   *
   * Atomically increments the Lamport clock and returns the new value.
   * This is the value to include in the event's `lamportClock` field.
   *
   * Note: This updates ONLY the lamportClock, not the full clock state.
   * Use updateVectorClock() to update both together.
   *
   * @param entityId - Entity identifier
   * @returns Next lamport clock value
   *
   * @example
   * const lamportClock = await getNextLamportClock("tx-123");
   * // Returns 6 (incremented from 5)
   */
  async getNextLamportClock(entityId: string): Promise<number> {
    const current = await this.getCurrentLamportClock(entityId);
    const next = current + 1;

    // Get existing state to preserve vector clock
    const existingState = await db.meta.get(`clock:${entityId}`);
    const existingClockState = existingState?.value as
      | { vectorClock?: Record<string, number> }
      | undefined;
    const existingVectorClock = existingClockState?.vectorClock || {};

    // Store updated value while preserving vector clock
    await db.meta.put({
      key: `clock:${entityId}`,
      value: {
        lamportClock: next,
        vectorClock: existingVectorClock,
        updatedAt: new Date().toISOString(),
      },
    });

    return next;
  }

  /**
   * Get current vector clock for an entity
   *
   * Returns the current vector clock without modification.
   * Returns empty clock {} if no state exists.
   *
   * @param entityId - Entity identifier
   * @returns Current vector clock (empty {} if not found)
   *
   * @example
   * await getCurrentVectorClock("tx-123");
   * // { deviceA: 5, deviceB: 3 }
   */
  async getCurrentVectorClock(entityId: string): Promise<VectorClock> {
    const state = await db.meta.get(`clock:${entityId}`);
    const clockState = state?.value as { vectorClock?: Record<string, number> } | undefined;
    return clockState?.vectorClock || {};
  }

  /**
   * Update vector clock for an entity
   *
   * Increments the vector clock for the specified device and also
   * increments the Lamport clock. This is the primary method to call
   * when creating a new event.
   *
   * Updates both clocks atomically:
   * 1. Increments vector clock for this device
   * 2. Increments Lamport clock
   * 3. Persists updated state to meta table
   *
   * @param entityId - Entity identifier
   * @param deviceId - Device making the change
   * @returns Updated vector clock
   *
   * @example
   * const vectorClock = await updateVectorClock("tx-123", "device-abc");
   * // { deviceA: 5, deviceB: 3, "device-abc": 1 }
   */
  async updateVectorClock(entityId: string, deviceId: string): Promise<VectorClock> {
    const current = await this.getCurrentVectorClock(entityId);
    const updated = incrementVectorClock(current, deviceId);
    const lamportClock = await this.getNextLamportClock(entityId);

    // Store updated vector clock with lamport clock
    await db.meta.put({
      key: `clock:${entityId}`,
      value: {
        lamportClock,
        vectorClock: updated,
        updatedAt: new Date().toISOString(),
      },
    });

    return updated;
  }

  /**
   * Merge remote vector clock with local
   *
   * Performs element-wise maximum merge of remote clock with local clock.
   * Used after syncing remote events to update local clock state.
   *
   * This operation:
   * - Takes max of each device counter (local vs remote)
   * - Preserves local Lamport clock (not overwritten)
   * - Persists merged state to meta table
   *
   * Important: This does NOT increment the Lamport clock, only merges
   * the vector clock. The Lamport clock is only incremented when this
   * device creates a new event.
   *
   * @param entityId - Entity identifier
   * @param remoteVectorClock - Vector clock from remote device
   *
   * @example
   * // After receiving remote event with vector clock
   * await mergeVectorClock("tx-123", remoteEvent.vectorClock);
   * // Local clock now reflects knowledge of remote events
   */
  async mergeVectorClock(entityId: string, remoteVectorClock: VectorClock): Promise<void> {
    const localClock = await this.getCurrentVectorClock(entityId);
    const merged = mergeVectorClocks(localClock, remoteVectorClock);

    // Get current Lamport clock to preserve it
    const currentLamport = await this.getCurrentLamportClock(entityId);

    await db.meta.put({
      key: `clock:${entityId}`,
      value: {
        lamportClock: currentLamport, // Preserve local Lamport clock
        vectorClock: merged,
        updatedAt: new Date().toISOString(),
      },
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton Lamport clock manager instance
 *
 * Use this singleton throughout the application to manage per-entity clocks.
 * Ensures consistent clock state across all event generation code.
 *
 * @example
 * import { lamportClockManager } from '@/lib/vector-clock';
 *
 * // In event generator
 * const lamportClock = await lamportClockManager.getNextLamportClock(entityId);
 * const vectorClock = await lamportClockManager.updateVectorClock(entityId, deviceId);
 */
export const lamportClockManager = new LamportClockManager();
