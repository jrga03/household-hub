/**
 * Conflict Resolution Types
 *
 * Type definitions for the conflict resolution engine that automatically
 * resolves conflicts detected via vector clock comparison.
 *
 * Resolution Strategies:
 * - record-lww: Record-level Last-Write-Wins (Phase B default)
 * - delete-wins: DELETE operation beats UPDATE regardless of clock
 * - manual: Requires user intervention (future)
 *
 * @see docs/implementation/chunks/033-conflict-resolution/instructions.md
 * @see docs/initial plan/SYNC-ENGINE.md (lines 365-514 for field-level rules)
 * @module types/resolution
 */

import type { TransactionEvent } from "@/types/event";

/**
 * Conflict resolution strategy
 *
 * Phase B Implementation:
 * - record-lww: Default strategy using lamport clock + deviceId tie-breaking
 * - delete-wins: Special case where DELETE always takes precedence
 * - manual: Deferred to Phase C for complex field-level conflicts
 */
export type ResolutionStrategy = "record-lww" | "delete-wins" | "manual";

/**
 * Result of conflict resolution
 *
 * Contains the winning and losing events, the strategy used, and reasoning
 * for transparency and audit trails.
 *
 * @example
 * {
 *   winner: { entityId: "tx-123", lamportClock: 5, ... },
 *   loser: { entityId: "tx-123", lamportClock: 3, ... },
 *   strategy: "record-lww",
 *   reason: "Record-level LWW: local has higher lamport clock"
 * }
 */
export interface ResolutionResult {
  /** Event that won the conflict resolution */
  winner: TransactionEvent;

  /** Event that lost the conflict resolution */
  loser: TransactionEvent;

  /** Strategy used to resolve the conflict */
  strategy: ResolutionStrategy;

  /** Human-readable explanation of why this resolution was chosen */
  reason: string;

  /**
   * Merged payload (optional - for field-level merge in Phase C)
   *
   * Phase B: Always undefined (uses winner.payload)
   * Phase C: May contain field-level merge result
   */
  mergedPayload?: any;
}
