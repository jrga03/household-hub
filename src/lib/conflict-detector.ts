/**
 * Conflict Detector for Household Hub Sync Engine
 *
 * Detects conflicts between local and remote events using vector clock comparison.
 * When two devices edit the same entity concurrently (no causal relationship),
 * a conflict is detected and logged to IndexedDB for resolution.
 *
 * Conflict Detection Logic:
 * - Compare vector clocks of local and remote events
 * - "concurrent" comparison result = conflict exists
 * - "local-ahead", "remote-ahead", or "equal" = no conflict
 *
 * Conflict Storage:
 * - Conflicts persisted to IndexedDB conflicts table
 * - Also added to Zustand store for UI notifications
 * - Used by sync processor to determine resolution strategy
 *
 * Key Concepts:
 * - Vector Clock: Tracks logical time across devices {deviceId: number}
 * - Concurrent Events: Neither event causally precedes the other (CONFLICT!)
 * - Sequential Events: One event happened-before the other (no conflict)
 *
 * @see docs/initial plan/SYNC-ENGINE.md (lines 340-511 for conflict resolution)
 * @see docs/implementation/chunks/032-conflict-detection/instructions.md
 * @module lib/conflict-detector
 */

import { nanoid } from "nanoid";
import type { TransactionEvent } from "@/types/event";
import type { Conflict, ConflictDetectionResult } from "@/types/sync";
import { compareVectorClocks } from "@/lib/vector-clock";
import { db } from "@/lib/dexie/db";
import { hasSentry } from "@/types/sentry";

// ============================================================================
// Conflict Detection Functions
// ============================================================================

/**
 * Detect if two events conflict based on vector clock comparison
 *
 * Two events conflict if their vector clocks are "concurrent" - meaning
 * both clocks have events the other doesn't. This indicates the edits
 * happened on different devices without knowledge of each other.
 *
 * Algorithm:
 * 1. Check if events target same entity (different entities can't conflict)
 * 2. Compare vector clocks using compareVectorClocks()
 * 3. Return hasConflict=true only if comparison is "concurrent"
 *
 * @param localEvent - Event from this device
 * @param remoteEvent - Event from remote device
 * @returns Detection result with conflict flag and comparison result
 *
 * @example
 * // Concurrent edits from two devices (CONFLICT!)
 * const local = {
 *   entityId: "tx-123",
 *   vectorClock: { deviceA: 5, deviceB: 2 },
 *   ...
 * };
 * const remote = {
 *   entityId: "tx-123",
 *   vectorClock: { deviceA: 3, deviceB: 4 },
 *   ...
 * };
 * const result = detectConflict(local, remote);
 * // { hasConflict: true, reason: "Concurrent edits...", comparison: "concurrent" }
 *
 * @example
 * // Sequential edits (no conflict)
 * const local = {
 *   entityId: "tx-123",
 *   vectorClock: { deviceA: 5, deviceB: 3 },
 *   ...
 * };
 * const remote = {
 *   entityId: "tx-123",
 *   vectorClock: { deviceA: 3, deviceB: 2 },
 *   ...
 * };
 * const result = detectConflict(local, remote);
 * // { hasConflict: false, comparison: "local-ahead" }
 */
export function detectConflict(
  localEvent: TransactionEvent,
  remoteEvent: TransactionEvent
): ConflictDetectionResult {
  // Validate required fields to prevent crashes from malformed events
  if (!localEvent?.entityId || !remoteEvent?.entityId) {
    console.error("[ConflictDetector] Invalid events: missing entityId", {
      local: localEvent?.entityId,
      remote: remoteEvent?.entityId,
    });
    return {
      hasConflict: false,
      comparison: "equal",
      reason: "Invalid event: missing entityId",
    };
  }

  if (!localEvent.vectorClock || !remoteEvent.vectorClock) {
    console.error("[ConflictDetector] Invalid events: missing vectorClock", {
      localEventId: localEvent.id,
      remoteEventId: remoteEvent.id,
    });
    return {
      hasConflict: false,
      comparison: "equal",
      reason: "Invalid event: missing vectorClock",
    };
  }

  // Different entities can't conflict
  if (localEvent.entityId !== remoteEvent.entityId) {
    return {
      hasConflict: false,
      comparison: "equal",
    };
  }

  // Compare vector clocks to determine causality
  const comparison = compareVectorClocks(localEvent.vectorClock, remoteEvent.vectorClock);

  // Only "concurrent" means conflict
  if (comparison === "concurrent") {
    return {
      hasConflict: true,
      reason: `Concurrent edits detected on ${localEvent.entityType} ${localEvent.entityId}`,
      comparison,
    };
  }

  // All other comparisons are not conflicts
  return {
    hasConflict: false,
    comparison,
  };
}

/**
 * Log a conflict to IndexedDB and notify UI
 *
 * Persists the conflict to the conflicts table in IndexedDB and adds
 * it to the Zustand store for UI notification. Uses dynamic import
 * to avoid circular dependency with conflict store.
 *
 * Conflict Record:
 * - id: Unique conflict ID (nanoid)
 * - entityType/entityId: Which entity has the conflict
 * - localEvent/remoteEvent: Full event objects for resolution
 * - resolution: "pending" (awaits automatic resolution)
 * - detectedAt: Timestamp of detection
 *
 * @param localEvent - Local event
 * @param remoteEvent - Remote event that conflicts
 *
 * @example
 * // After detecting conflict in sync processor
 * if (detectionResult.hasConflict) {
 *   await logConflict(localEvent, remoteEvent);
 *   // Conflict now stored in IndexedDB and visible in UI
 * }
 */
export async function logConflict(
  localEvent: TransactionEvent,
  remoteEvent: TransactionEvent
): Promise<void> {
  const conflictId = nanoid();

  // Create conflict record (using snake_case to match Dexie schema)
  const conflict: Conflict = {
    id: conflictId,
    entity_type: localEvent.entityType,
    entity_id: localEvent.entityId,
    detected_at: new Date().toISOString(),
    local_event: localEvent,
    remote_event: remoteEvent,
    resolution: "pending",
    resolved_value: null,
    resolved_at: null,
  };

  // Persist to IndexedDB using put() for idempotent writes
  // This prevents race conditions when the same conflict is detected twice
  try {
    await db.conflicts.put(conflict);
  } catch (error) {
    console.error("[ConflictDetector] Failed to persist conflict to IndexedDB:", error);
    // Log to observability system if available
    if (typeof window !== "undefined" && hasSentry(window)) {
      window.Sentry.captureException(error, {
        tags: { subsystem: "conflict-detector", operation: "persist-conflict" },
        extra: { conflictId: conflict.id, entityId: conflict.entity_id },
      });
    }
    throw error; // Re-throw so caller knows about the failure
  }

  // Notify UI via Zustand store (dynamic import to avoid circular dependency)
  try {
    const { useConflictStore } = await import("@/stores/conflictStore");
    useConflictStore.getState().addConflict(conflict);
  } catch (error) {
    console.error("[ConflictDetector] Failed to notify conflict store:", error);
    // Log to observability system but don't throw - IndexedDB write succeeded
    // UI can self-heal by loading conflicts from IndexedDB on next startup
    if (typeof window !== "undefined" && hasSentry(window)) {
      window.Sentry.captureException(error, {
        tags: { subsystem: "conflict-detector", operation: "store-notification" },
        extra: { conflictId: conflict.id, entityId: conflict.entity_id },
      });
    }
  }

  console.log(
    `[ConflictDetector] Logged conflict for ${conflict.entity_type} ${conflict.entity_id}`
  );
}

/**
 * Check if an entity has pending conflicts
 *
 * Queries the conflicts table to see if the specified entity has any
 * unresolved conflicts. Used by sync processor to determine if special
 * conflict resolution logic is needed.
 *
 * @param entityId - Entity ID to check
 * @returns True if pending conflicts exist
 *
 * @example
 * // Before syncing an entity
 * const hasPending = await hasPendingConflicts("tx-123");
 * if (hasPending) {
 *   // Use conflict resolution strategy
 * }
 */
export async function hasPendingConflicts(entityId: string): Promise<boolean> {
  const count = await db.conflicts.where({ entity_id: entityId, resolution: "pending" }).count();
  return count > 0;
}

/**
 * Get all pending conflicts for an entity
 *
 * Retrieves all unresolved conflicts for a specific entity.
 * Used by sync processor for field-level conflict resolution.
 *
 * @param entityId - Entity ID to query
 * @returns Array of pending conflicts
 *
 * @example
 * // In sync processor
 * const conflicts = await getPendingConflicts("tx-123");
 * for (const conflict of conflicts) {
 *   // Apply field-level resolution strategy
 *   const resolved = resolveConflict(conflict);
 *   // Mark as resolved...
 * }
 */
export async function getPendingConflicts(entityId: string): Promise<Conflict[]> {
  const dbConflicts = await db.conflicts
    .where({ entity_id: entityId, resolution: "pending" })
    .toArray();

  // Return conflicts directly (no conversion needed - both use snake_case)
  // Cast entity_type to specific union type for type safety
  return dbConflicts as Conflict[];
}
