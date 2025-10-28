/**
 * Unit tests for conflict detection logic
 *
 * Tests the core conflict detection algorithm using vector clock comparison.
 * Ensures conflicts are correctly identified for concurrent edits while
 * sequential edits are not flagged as conflicts.
 *
 * Test Scenarios:
 * 1. Concurrent edits (CONFLICT): Both devices have events the other doesn't
 * 2. Sequential edits (no conflict): One device's changes include the other's
 * 3. Different entities (no conflict): Same entity ID required for conflict
 *
 * @see docs/initial plan/SYNC-ENGINE.md (lines 340-362 for vector clock algorithm)
 */

import { describe, it, expect } from "vitest";
import { detectConflict } from "./conflict-detector";
import type { TransactionEvent } from "@/types/event";

/**
 * Helper to create mock TransactionEvent for testing
 */
function createMockEvent(
  entityId: string,
  vectorClock: Record<string, number>,
  deviceId: string = "device-A"
): TransactionEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 9)}`,
    householdId: "household-123",
    entityType: "transaction",
    entityId,
    op: "update",
    payload: { amount_cents: 50000 },
    timestamp: Date.now(),
    actorUserId: "user-123",
    deviceId,
    idempotencyKey: `${deviceId}-transaction-${entityId}-1`,
    eventVersion: 1,
    lamportClock: 1,
    vectorClock,
    checksum: "mock-checksum",
  };
}

describe("detectConflict", () => {
  it("should detect concurrent edits as conflict", () => {
    // Scenario: Device A and Device B both edit transaction "tx-123" concurrently
    // Device A: { deviceA: 5, deviceB: 2 } - knows about deviceB's clock=2
    // Device B: { deviceA: 3, deviceB: 4 } - knows about deviceA's clock=3
    // Result: Concurrent because both have events the other doesn't (CONFLICT!)

    const localEvent = createMockEvent("tx-123", { deviceA: 5, deviceB: 2 }, "device-A");
    const remoteEvent = createMockEvent("tx-123", { deviceA: 3, deviceB: 4 }, "device-B");

    const result = detectConflict(localEvent, remoteEvent);

    expect(result.hasConflict).toBe(true);
    expect(result.comparison).toBe("concurrent");
    expect(result.reason).toContain("Concurrent edits detected");
  });

  it("should not detect conflict for sequential edits", () => {
    // Scenario: Device A edits first, then Device B edits (sequential order)
    // Device A: { deviceA: 3, deviceB: 2 } - older state
    // Device B: { deviceA: 5, deviceB: 3 } - newer state (includes all of A's edits)
    // Result: Local-ahead (no conflict) because B's clock dominates A's

    const localEvent = createMockEvent("tx-123", { deviceA: 5, deviceB: 3 }, "device-B");
    const remoteEvent = createMockEvent("tx-123", { deviceA: 3, deviceB: 2 }, "device-A");

    const result = detectConflict(localEvent, remoteEvent);

    expect(result.hasConflict).toBe(false);
    expect(result.comparison).toBe("local-ahead");
    expect(result.reason).toBeUndefined();
  });

  it("should not detect conflict for different entities", () => {
    // Scenario: Same device edits two different transactions
    // Even if clocks are concurrent, different entities can't conflict with each other

    const localEvent = createMockEvent("tx-123", { deviceA: 5, deviceB: 2 }, "device-A");
    const remoteEvent = createMockEvent("tx-456", { deviceA: 3, deviceB: 4 }, "device-B");

    const result = detectConflict(localEvent, remoteEvent);

    expect(result.hasConflict).toBe(false);
    expect(result.comparison).toBe("equal"); // Returns "equal" for different entities
    expect(result.reason).toBeUndefined();
  });
});
