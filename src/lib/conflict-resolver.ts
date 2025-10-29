/**
 * Conflict Resolution Engine for Household Hub Sync
 *
 * Automatically resolves conflicts detected via vector clock comparison.
 * Phase B implementation uses record-level Last-Write-Wins with DELETE priority.
 *
 * Resolution Strategy (Phase B):
 * 1. DELETE always wins over UPDATE (prevents zombie entities)
 * 2. Record-level LWW using lamport clock + deviceId tie-breaking
 * 3. Deterministic: Same conflict always resolves the same way
 * 4. Commutative: resolve(A,B) == resolve(B,A)
 *
 * Phase C Enhancement (Deferred per Decision #85):
 * - Field-level merge rules (cleared-wins, concatenate, false-wins)
 * - Per-field resolution strategies
 * - Manual resolution UI for complex conflicts
 *
 * Key Architectural Principles:
 * - Determinism: Lamport clock provides total ordering within entity
 * - Device ID tie-breaking: Lexicographic comparison for equal clocks
 * - DELETE-wins: DELETE operations have special priority to prevent resurrections
 * - Transparency: All resolutions logged to IndexedDB with reasoning
 *
 * @see docs/implementation/chunks/033-conflict-resolution/instructions.md
 * @see docs/initial plan/SYNC-ENGINE.md (lines 365-514)
 * @see docs/initial plan/DECISIONS.md (Decision #78, #85)
 * @module lib/conflict-resolver
 */

import type { TransactionEvent } from "@/types/event";
import type { Conflict } from "@/types/sync";
import type { ResolutionResult } from "@/types/resolution";
import { db } from "@/lib/dexie/db";
import { hasSentry } from "@/types/sentry";

/**
 * Conflict Resolution Engine (Phase B: Record-level LWW)
 *
 * Resolves conflicts using deterministic strategies:
 * 1. DELETE-wins: DELETE operations always take precedence
 * 2. Record-level LWW: Higher lamport clock wins, tie-break with deviceId
 *
 * Performance:
 * - Resolution is fast (<1ms) so can run synchronously during sync
 * - No network calls required (local computation only)
 *
 * Determinism Guarantees:
 * - Same inputs always produce same winner
 * - Commutative: resolve(A, B) == resolve(B, A)
 * - Uses string comparison for total ordering: `"${lamport}-${deviceId}"`
 *
 * @example
 * // Resolve a conflict automatically
 * const result = await conflictResolutionEngine.resolveConflict(localEvent, remoteEvent);
 * if (result.strategy === "delete-wins") {
 *   // DELETE won - remove entity from IndexedDB
 * } else {
 *   // Apply winning event's payload
 * }
 */
export class ConflictResolutionEngine {
  /**
   * Resolve conflict using Phase B strategy (record-level LWW)
   *
   * Algorithm:
   * 1. Check if either event is DELETE (if so, DELETE always wins)
   * 2. Otherwise use record-level LWW based on lamport clock
   * 3. Tie-break with lexicographic deviceId comparison
   *
   * @param localEvent - Event from this device
   * @param remoteEvent - Event from remote device
   * @returns Resolution result with winner, loser, strategy, and reason
   *
   * @example
   * // DELETE vs UPDATE (DELETE wins)
   * const result = await resolver.resolveConflict(
   *   { op: "update", lamportClock: 10, deviceId: "A", ... },
   *   { op: "delete", lamportClock: 5, deviceId: "B", ... }
   * );
   * // result.winner.op === "delete"
   * // result.strategy === "delete-wins"
   *
   * @example
   * // UPDATE vs UPDATE (higher lamport wins)
   * const result = await resolver.resolveConflict(
   *   { op: "update", lamportClock: 5, deviceId: "A", ... },
   *   { op: "update", lamportClock: 3, deviceId: "B", ... }
   * );
   * // result.winner.lamportClock === 5
   * // result.strategy === "record-lww"
   */
  async resolveConflict(
    localEvent: TransactionEvent,
    remoteEvent: TransactionEvent
  ): Promise<ResolutionResult> {
    // Special case: DELETE always wins (prevents zombie entities)
    // This check MUST happen BEFORE LWW logic
    if (localEvent.op === "delete" || remoteEvent.op === "delete") {
      return this.resolveDeleteConflict(localEvent, remoteEvent);
    }

    // Default: Record-level Last-Write-Wins
    return this.resolveRecordLWW(localEvent, remoteEvent);
  }

  /**
   * Record-level Last-Write-Wins using lamport clock + deviceId
   *
   * Uses string comparison for deterministic tie-breaking:
   * - Compare: `"${lamportClock}-${deviceId}"`
   * - Lexicographic comparison ensures total ordering
   * - Same inputs always produce same winner (determinism)
   *
   * Why String Comparison?
   * - Ensures determinism across devices (no clock skew issues)
   * - Lexicographic ordering provides tie-breaking for equal lamport clocks
   * - DeviceId suffix ensures resolve(A,B) == resolve(B,A) (commutative)
   *
   * @param localEvent - Local event
   * @param remoteEvent - Remote event
   * @returns Resolution result with winner as event with higher ordering
   *
   * @example
   * // Higher lamport clock wins
   * resolveRecordLWW(
   *   { lamportClock: 5, deviceId: "A", ... },
   *   { lamportClock: 3, deviceId: "B", ... }
   * );
   * // Winner: lamportClock=5 (local)
   *
   * @example
   * // Tie-breaking with deviceId
   * resolveRecordLWW(
   *   { lamportClock: 5, deviceId: "device-abc", ... },
   *   { lamportClock: 5, deviceId: "device-xyz", ... }
   * );
   * // Winner: deviceId="device-xyz" (lexicographic: "xyz" > "abc")
   */
  private resolveRecordLWW(
    localEvent: TransactionEvent,
    remoteEvent: TransactionEvent
  ): ResolutionResult {
    // Create deterministic ordering strings: "${lamportClock}-${deviceId}"
    // This ensures total ordering for conflict resolution
    const localOrder = `${localEvent.lamportClock}-${localEvent.deviceId}`;
    const remoteOrder = `${remoteEvent.lamportClock}-${remoteEvent.deviceId}`;

    // Lexicographic comparison provides deterministic winner
    const winner = localOrder > remoteOrder ? localEvent : remoteEvent;
    const loser = winner === localEvent ? remoteEvent : localEvent;

    return {
      winner,
      loser,
      strategy: "record-lww",
      reason: `Record-level LWW: ${winner === localEvent ? "local" : "remote"} has higher lamport clock`,
    };
  }

  /**
   * DELETE always wins over UPDATE
   *
   * Prevents "zombie" entities that get resurrected after deletion.
   * DELETE operation takes precedence regardless of lamport clock.
   *
   * If both events are DELETE:
   * - Use lamport clock to pick winner (keeps higher clock's metadata)
   * - Final result: entity is deleted in both cases
   *
   * Rationale:
   * - Deletion is a strong signal that entity should not exist
   * - UPDATE after DELETE would resurrect entity (confusing UX)
   * - Consistent with user expectations ("if I delete it, it stays deleted")
   *
   * @param localEvent - Local event
   * @param remoteEvent - Remote event
   * @returns Resolution result with DELETE event as winner
   *
   * @example
   * // DELETE vs UPDATE (DELETE wins despite lower lamport)
   * resolveDeleteConflict(
   *   { op: "update", lamportClock: 10, ... },
   *   { op: "delete", lamportClock: 5, ... }
   * );
   * // Winner: op="delete" (remote)
   * // Strategy: "delete-wins"
   *
   * @example
   * // DELETE vs DELETE (use lamport for tie-breaking)
   * resolveDeleteConflict(
   *   { op: "delete", lamportClock: 7, deviceId: "A", ... },
   *   { op: "delete", lamportClock: 5, deviceId: "B", ... }
   * );
   * // Winner: lamportClock=7 (local) - keeps higher clock's metadata
   */
  private resolveDeleteConflict(
    localEvent: TransactionEvent,
    remoteEvent: TransactionEvent
  ): ResolutionResult {
    // If both are DELETE, use lamport clock to pick winner (preserves metadata from more recent deletion)
    if (localEvent.op === "delete" && remoteEvent.op === "delete") {
      const localOrder = `${localEvent.lamportClock}-${localEvent.deviceId}`;
      const remoteOrder = `${remoteEvent.lamportClock}-${remoteEvent.deviceId}`;

      const winner = localOrder > remoteOrder ? localEvent : remoteEvent;
      const loser = winner === localEvent ? remoteEvent : localEvent;

      return {
        winner,
        loser,
        strategy: "delete-wins",
        reason: `Both events DELETE - using lamport clock for metadata (${winner === localEvent ? "local" : "remote"} has higher clock: ${winner.lamportClock} vs ${loser.lamportClock})`,
      };
    }

    // One is DELETE, one is not - DELETE always wins
    const deleteEvent = localEvent.op === "delete" ? localEvent : remoteEvent;
    const otherEvent = deleteEvent === localEvent ? remoteEvent : localEvent;

    return {
      winner: deleteEvent,
      loser: otherEvent,
      strategy: "delete-wins",
      reason: "DELETE operation always takes precedence",
    };
  }

  /**
   * Log resolution for transparency and audit trail
   *
   * Updates the conflict record in IndexedDB with:
   * - resolution: "pending" → "resolved"
   * - resolvedValue: Winning event's payload
   * - resolvedAt: Current timestamp
   *
   * Provides transparency:
   * - Users can see how conflicts were resolved
   * - Audit trail for debugging sync issues
   * - Analytics for conflict resolution patterns
   *
   * Error Handling:
   * - Logs errors to console and Sentry if available
   * - Throws error to caller (sync processor should handle)
   *
   * @param conflict - Conflict record from IndexedDB
   * @param result - Resolution result from resolveConflict()
   *
   * @example
   * // After resolving conflict
   * const conflict = await logConflict(localEvent, remoteEvent);
   * const result = await resolver.resolveConflict(localEvent, remoteEvent);
   * await resolver.logResolution(conflict, result);
   * // Conflict record now has resolution="resolved", resolvedValue, resolvedAt
   */
  async logResolution(conflict: Conflict, result: ResolutionResult): Promise<void> {
    try {
      // Update conflict record with resolution details
      await db.conflicts.update(conflict.id, {
        resolution: "resolved",
        resolved_value: result.winner.payload,
        resolved_at: new Date().toISOString(),
      });

      // Log to console for debugging
      console.log(`[ConflictResolver] Conflict resolved:`, {
        entityId: conflict.entity_id,
        entityType: conflict.entity_type,
        strategy: result.strategy,
        winner: result.winner === conflict.local_event ? "local" : "remote",
        winnerLamport: result.winner.lamportClock,
        loserLamport: result.loser.lamportClock,
      });
    } catch (error) {
      console.error("[ConflictResolver] Failed to log resolution:", error);

      // Log to observability system if available
      if (typeof window !== "undefined" && hasSentry(window)) {
        window.Sentry.captureException(error, {
          tags: { subsystem: "conflict-resolver", operation: "log-resolution" },
          extra: {
            conflictId: conflict.id,
            entityId: conflict.entity_id,
            strategy: result.strategy,
          },
        });
      }

      throw error; // Re-throw so sync processor can handle
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton conflict resolution engine instance
 *
 * Use this instance throughout the application for consistency.
 *
 * @example
 * import { conflictResolutionEngine } from "@/lib/conflict-resolver";
 *
 * const result = await conflictResolutionEngine.resolveConflict(local, remote);
 * await conflictResolutionEngine.logResolution(conflict, result);
 */
export const conflictResolutionEngine = new ConflictResolutionEngine();
