/**
 * Vector Clock Manager for Conflict Detection
 *
 * Implements per-entity vector clocks for detecting concurrent modifications
 * in distributed sync. Vector clocks track the logical clock value for each
 * device that has modified an entity.
 *
 * Key Properties:
 * - Per-entity scoping: Each entity has independent vector clock (NOT global)
 * - Device tracking: Maps device ID → clock value for that device
 * - Concurrent detection: Can detect when two devices modify same entity
 * - Causal ordering: Determines if one modification happened-before another
 *
 * Storage Strategy:
 * - Stored in IndexedDB meta table as JSON
 * - Key format: `vectorClock-${entityId}`
 * - Value: Record<deviceId, number> (e.g., {"device-abc": 5, "device-xyz": 3})
 * - Empty object {} for new entities
 *
 * Phase A vs Phase B:
 * - Phase A: Vector clocks stored but not used (simple last-write-wins)
 * - Phase B: Used for field-level conflict resolution and concurrent detection
 *
 * See SYNC-ENGINE.md lines 365-511 for conflict resolution strategy.
 * See DECISIONS.md #77 for deterministic merge rules.
 *
 * @module sync/vectorClock
 */

import { db } from "@/lib/dexie/db";
import { deviceManager } from "@/lib/dexie/deviceManager";
import type { VectorClock } from "@/types/sync";

/**
 * Storage key prefix for vector clocks in meta table.
 */
const VECTOR_CLOCK_PREFIX = "vectorClock";

/**
 * Generates storage key for entity's vector clock.
 *
 * @param entityId - Entity identifier (may be temporary)
 * @returns Storage key for meta table
 *
 * @example
 * getVectorClockKey("transaction-123")
 * // "vectorClock-transaction-123"
 */
function getVectorClockKey(entityId: string): string {
  return `${VECTOR_CLOCK_PREFIX}-${entityId}`;
}

/**
 * Gets the current vector clock for an entity.
 *
 * Returns the complete vector clock showing the clock value for each device
 * that has modified this entity. Used for conflict detection and resolution.
 *
 * Behavior:
 * - Reads vector clock from IndexedDB meta table
 * - Returns empty object {} if entity has no vector clock yet
 * - Returns complete device ID → clock value mapping
 *
 * Error Handling:
 * - IndexedDB errors: Logged and returns empty object {}
 * - Meta table unavailable: Returns empty object {}
 * - Malformed clock data: Returns empty object {}
 *
 * @param entityId - Entity identifier to get vector clock for
 * @returns Promise resolving to vector clock (device ID → clock value)
 *
 * @example
 * const clock = await getVectorClock("transaction-123");
 * // { "device-abc": 5, "device-xyz": 3 }
 *
 * @example
 * const newClock = await getVectorClock("transaction-new");
 * // {} (no modifications yet)
 */
export async function getVectorClock(entityId: string): Promise<VectorClock> {
  try {
    const key = getVectorClockKey(entityId);
    const entry = await db.meta.get(key);

    // Return empty object if no clock exists
    if (!entry?.value) {
      return {};
    }

    // Validate clock is object (not array, null, etc.)
    if (typeof entry.value !== "object" || Array.isArray(entry.value)) {
      console.warn(`Invalid vector clock format for entity ${entityId}:`, entry.value);
      return {};
    }

    return entry.value as VectorClock;
  } catch (error) {
    console.error(`Failed to get vector clock for entity ${entityId}:`, error);
    return {};
  }
}

/**
 * Increments the vector clock for an entity (for THIS device only).
 *
 * This is the primary function called during sync operations to record that
 * this device has modified the entity. Increments only the clock value for
 * the current device, leaving other device clocks unchanged.
 *
 * Behavior:
 * - Gets current device ID from deviceManager
 * - Reads current vector clock from meta table
 * - Increments ONLY this device's clock value by 1
 * - Other device clock values remain unchanged
 * - Stores updated vector clock back to meta table
 * - Returns complete updated vector clock
 *
 * Phase A Usage:
 * - Called on every create/update/delete operation
 * - Clock values stored but not used for conflict resolution (yet)
 * - Prepares data for Phase B field-level conflict resolution
 *
 * Phase B Usage:
 * - Used to detect concurrent modifications from multiple devices
 * - Enables field-level conflict resolution based on vector clock dominance
 * - Critical for maintaining causal ordering in distributed system
 *
 * Error Handling:
 * - Device ID unavailable: Uses "unknown-device" placeholder (warn)
 * - IndexedDB errors: Logged and returns minimal clock with current device
 * - Meta table unavailable: Returns minimal clock (graceful degradation)
 *
 * @param entityId - Entity identifier to increment vector clock for
 * @returns Promise resolving to updated vector clock
 *
 * @example
 * // First modification by device-abc
 * const clock1 = await incrementVectorClock("transaction-123");
 * // { "device-abc": 1 }
 *
 * @example
 * // Second modification by device-abc
 * const clock2 = await incrementVectorClock("transaction-123");
 * // { "device-abc": 2 }
 *
 * @example
 * // Modification by device-xyz (different device)
 * const clock3 = await incrementVectorClock("transaction-123");
 * // { "device-abc": 2, "device-xyz": 1 }
 */
export async function incrementVectorClock(entityId: string): Promise<VectorClock> {
  try {
    // Get current device ID
    const deviceId = await deviceManager.getDeviceId();

    // Get current vector clock
    const currentClock = await getVectorClock(entityId);

    // Increment THIS device's clock value only
    const currentDeviceClock = currentClock[deviceId] ?? 0;
    const updatedClock: VectorClock = {
      ...currentClock,
      [deviceId]: currentDeviceClock + 1,
    };

    // Store updated vector clock
    const key = getVectorClockKey(entityId);
    await db.meta.put({ key, value: updatedClock });

    return updatedClock;
  } catch (error) {
    console.error(`Failed to increment vector clock for entity ${entityId}:`, error);

    // Fallback: Return minimal clock with current device
    try {
      const deviceId = await deviceManager.getDeviceId();
      return { [deviceId]: 1 };
    } catch {
      // Double fallback: Use unknown device
      console.error("Failed to get device ID, using unknown-device placeholder");
      return { "unknown-device": 1 };
    }
  }
}

/**
 * Merges two vector clocks (takes maximum for each device).
 *
 * This function is used during sync to combine clock values from multiple
 * devices. For each device, takes the maximum clock value across both clocks.
 * This maintains monotonicity and causal ordering.
 *
 * Phase B Usage:
 * - Called when receiving sync events from server
 * - Ensures local clock incorporates remote modifications
 * - Maintains causal ordering across all devices
 * - Used in conflict resolution to determine event ordering
 *
 * Behavior:
 * - For each device in v1 or v2:
 *   - Take max(v1[device], v2[device])
 *   - If device only in v1: Use v1[device]
 *   - If device only in v2: Use v2[device]
 * - Returns new merged clock (doesn't modify inputs)
 * - Result includes all devices from both clocks
 *
 * Merge Properties:
 * - Commutative: merge(v1, v2) = merge(v2, v1)
 * - Idempotent: merge(v, v) = v
 * - Monotonic: Result ≥ both inputs for all devices
 *
 * @param v1 - First vector clock
 * @param v2 - Second vector clock
 * @returns Merged vector clock (max for each device)
 *
 * @example
 * const v1 = { "device-abc": 5, "device-xyz": 3 };
 * const v2 = { "device-abc": 3, "device-xyz": 7, "device-123": 2 };
 * const merged = mergeVectorClocks(v1, v2);
 * // { "device-abc": 5, "device-xyz": 7, "device-123": 2 }
 *
 * @example
 * const v1 = { "device-abc": 5 };
 * const v2 = { "device-xyz": 3 };
 * const merged = mergeVectorClocks(v1, v2);
 * // { "device-abc": 5, "device-xyz": 3 }
 */
export function mergeVectorClocks(v1: VectorClock, v2: VectorClock): VectorClock {
  const merged: VectorClock = { ...v1 };

  // For each device in v2, take max with v1
  for (const [deviceId, clockValue] of Object.entries(v2)) {
    const v1Clock = merged[deviceId] ?? 0;
    merged[deviceId] = Math.max(v1Clock, clockValue);
  }

  return merged;
}

/**
 * Compares two vector clocks to determine causal ordering.
 *
 * This is the core function for Phase B conflict detection. Determines if
 * one clock is ahead of the other (one modification happened-before the other)
 * or if they are concurrent (modifications happened in parallel on different devices).
 *
 * Return Values:
 * - "equal": Clocks are identical (same modifications on all devices)
 * - "v1-ahead": v1 dominates v2 (v1 happened-after v2, no conflict)
 * - "v2-ahead": v2 dominates v1 (v2 happened-after v1, no conflict)
 * - "concurrent": Neither dominates (modifications in parallel, CONFLICT!)
 *
 * Dominance Definition:
 * - v1 dominates v2 if: v1[device] ≥ v2[device] for ALL devices
 * - AND at least one device where v1[device] > v2[device]
 *
 * Phase B Usage:
 * - Detect concurrent modifications that need field-level merge
 * - Determine which event is newer when possible
 * - Trigger conflict resolution when concurrent detected
 *
 * Edge Cases:
 * - Empty clocks: {} = {} → "equal"
 * - Disjoint clocks: {a:1} vs {b:1} → "concurrent"
 * - One empty: {a:1} vs {} → "v1-ahead"
 *
 * @param v1 - First vector clock
 * @param v2 - Second vector clock
 * @returns Comparison result string
 *
 * @example
 * // v1 is ahead (happened later)
 * const result = compareVectorClocks(
 *   { "device-abc": 5, "device-xyz": 3 },
 *   { "device-abc": 5, "device-xyz": 2 }
 * );
 * // "v1-ahead"
 *
 * @example
 * // Concurrent modifications (conflict!)
 * const result = compareVectorClocks(
 *   { "device-abc": 5, "device-xyz": 2 },
 *   { "device-abc": 3, "device-xyz": 4 }
 * );
 * // "concurrent"
 *
 * @example
 * // Identical clocks
 * const result = compareVectorClocks(
 *   { "device-abc": 5 },
 *   { "device-abc": 5 }
 * );
 * // "equal"
 */
export function compareVectorClocks(
  v1: VectorClock,
  v2: VectorClock
): "equal" | "v1-ahead" | "v2-ahead" | "concurrent" {
  // Collect all devices from both clocks
  const allDevices = new Set([...Object.keys(v1), ...Object.keys(v2)]);

  let v1Greater = false; // At least one device where v1 > v2
  let v2Greater = false; // At least one device where v2 > v1

  for (const deviceId of allDevices) {
    const v1Clock = v1[deviceId] ?? 0;
    const v2Clock = v2[deviceId] ?? 0;

    if (v1Clock > v2Clock) {
      v1Greater = true;
    } else if (v2Clock > v1Clock) {
      v2Greater = true;
    }
  }

  // Determine relationship
  if (!v1Greater && !v2Greater) {
    // All devices have same clock values
    return "equal";
  } else if (v1Greater && !v2Greater) {
    // v1 ≥ v2 for all devices, and v1 > v2 for at least one
    return "v1-ahead";
  } else if (v2Greater && !v1Greater) {
    // v2 ≥ v1 for all devices, and v2 > v1 for at least one
    return "v2-ahead";
  } else {
    // Both v1Greater and v2Greater are true
    // This means concurrent modifications (conflict!)
    return "concurrent";
  }
}
