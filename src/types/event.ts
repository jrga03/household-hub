// Unused in this file but kept for potential future use
// import type { DevicePlatform } from "./device";

/**
 * Entity types that can generate events
 */
export type EntityType = "transaction" | "account" | "category" | "budget";

/**
 * Event operation types
 */
export type EventOp = "create" | "update" | "delete";

/**
 * Vector clock mapping device IDs to clock values
 * Scoped to specific entity (not global)
 */
export interface VectorClock {
  [deviceId: string]: number;
}

/**
 * Transaction event structure
 */
export interface TransactionEvent {
  id: string;
  householdId: string;
  entityType: EntityType;
  entityId: string;
  op: EventOp;
  payload: unknown; // Changed fields (full for create, delta for update)

  // Timestamps
  timestamp: number; // Unix timestamp
  actorUserId: string;
  deviceId: string;

  // Idempotency
  idempotencyKey: string;
  eventVersion: number;

  // Conflict resolution
  lamportClock: number;
  vectorClock: VectorClock;

  // Integrity
  checksum: string;
}
