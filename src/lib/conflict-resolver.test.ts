/**
 * Unit Tests for Conflict Resolution Engine
 *
 * Tests the deterministic conflict resolution logic that automatically
 * resolves conflicts detected via vector clock comparison.
 *
 * Test Coverage:
 * 1. Record-level LWW based on lamport clock
 * 2. Device ID tie-breaking for equal lamport clocks
 * 3. DELETE prioritization over UPDATE operations
 * 4. Determinism (same inputs → same output)
 * 5. Commutativity (resolve(A,B) == resolve(B,A))
 *
 * @see src/lib/conflict-resolver.ts
 * @see docs/implementation/chunks/033-conflict-resolution/instructions.md
 */

import { describe, it, expect } from "vitest";
import { ConflictResolutionEngine } from "./conflict-resolver";
import type { TransactionEvent } from "@/types/event";

// Create resolver instance for testing
const resolver = new ConflictResolutionEngine();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock TransactionEvent for testing
 */
function createMockEvent(overrides: Partial<TransactionEvent>): TransactionEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    householdId: "household-test",
    entityType: "transaction",
    entityId: "tx-test",
    op: "update",
    payload: { amount_cents: 100000 },
    timestamp: Date.now(),
    actorUserId: "user-test",
    deviceId: "device-test",
    idempotencyKey: "test-key",
    eventVersion: 1,
    lamportClock: 1,
    vectorClock: { "device-test": 1 },
    checksum: "test-checksum",
    ...overrides,
  };
}

// ============================================================================
// Test Suite: Record-Level Last-Write-Wins
// ============================================================================

describe("Conflict Resolution: Record-Level LWW", () => {
  it("should resolve based on lamport clock (higher wins)", async () => {
    const localEvent = createMockEvent({
      entityId: "tx-123",
      op: "update",
      lamportClock: 5,
      deviceId: "device-A",
      payload: { amount_cents: 100000 },
    });

    const remoteEvent = createMockEvent({
      entityId: "tx-123",
      op: "update",
      lamportClock: 3,
      deviceId: "device-B",
      payload: { amount_cents: 200000 },
    });

    const result = await resolver.resolveConflict(localEvent, remoteEvent);

    // Local event has higher lamport clock (5 > 3)
    expect(result.winner).toBe(localEvent);
    expect(result.loser).toBe(remoteEvent);
    expect(result.strategy).toBe("record-lww");
    expect(result.reason).toContain("local has higher lamport clock");

    // Verify winning payload is used
    expect((result.winner.payload as Record<string, unknown>).amount_cents).toBe(100000);
  });

  it("should resolve based on lamport clock (remote wins)", async () => {
    const localEvent = createMockEvent({
      entityId: "tx-456",
      op: "update",
      lamportClock: 2,
      deviceId: "device-A",
      payload: { amount_cents: 100000 },
    });

    const remoteEvent = createMockEvent({
      entityId: "tx-456",
      op: "update",
      lamportClock: 8,
      deviceId: "device-B",
      payload: { amount_cents: 200000 },
    });

    const result = await resolver.resolveConflict(localEvent, remoteEvent);

    // Remote event has higher lamport clock (8 > 2)
    expect(result.winner).toBe(remoteEvent);
    expect(result.loser).toBe(localEvent);
    expect(result.strategy).toBe("record-lww");
    expect(result.reason).toContain("remote has higher lamport clock");

    // Verify winning payload is used
    expect((result.winner.payload as Record<string, unknown>).amount_cents).toBe(200000);
  });
});

// ============================================================================
// Test Suite: Device ID Tie-Breaking
// ============================================================================

describe("Conflict Resolution: Device ID Tie-Breaking", () => {
  it("should use deviceId for tie-breaking when lamport clocks are equal", async () => {
    const localEvent = createMockEvent({
      entityId: "tx-789",
      op: "update",
      lamportClock: 5,
      deviceId: "device-B",
      payload: { amount_cents: 100000 },
    });

    const remoteEvent = createMockEvent({
      entityId: "tx-789",
      op: "update",
      lamportClock: 5,
      deviceId: "device-A",
      payload: { amount_cents: 200000 },
    });

    const result = await resolver.resolveConflict(localEvent, remoteEvent);

    // Equal lamport clocks (5 == 5), use deviceId tie-breaking
    // "device-B" > "device-A" lexicographically
    expect(result.winner).toBe(localEvent);
    expect(result.loser).toBe(remoteEvent);
    expect(result.strategy).toBe("record-lww");

    // Verify lexicographic comparison
    expect("device-B" > "device-A").toBe(true);
  });

  it("should use deviceId tie-breaking (reverse order)", async () => {
    const localEvent = createMockEvent({
      entityId: "tx-abc",
      op: "update",
      lamportClock: 5,
      deviceId: "device-abc",
      payload: { description: "From ABC" },
    });

    const remoteEvent = createMockEvent({
      entityId: "tx-abc",
      op: "update",
      lamportClock: 5,
      deviceId: "device-xyz",
      payload: { description: "From XYZ" },
    });

    const result = await resolver.resolveConflict(localEvent, remoteEvent);

    // Equal lamport clocks (5 == 5), use deviceId tie-breaking
    // "device-xyz" > "device-abc" lexicographically
    expect(result.winner).toBe(remoteEvent);
    expect(result.loser).toBe(localEvent);
    expect(result.strategy).toBe("record-lww");

    // Verify lexicographic comparison
    expect("device-xyz" > "device-abc").toBe(true);
  });
});

// ============================================================================
// Test Suite: DELETE-Wins Strategy
// ============================================================================

describe("Conflict Resolution: DELETE-Wins", () => {
  it("should prioritize DELETE over UPDATE (DELETE is local)", async () => {
    const localEvent = createMockEvent({
      entityId: "tx-del-1",
      op: "delete",
      lamportClock: 3,
      deviceId: "device-A",
      payload: {},
    });

    const remoteEvent = createMockEvent({
      entityId: "tx-del-1",
      op: "update",
      lamportClock: 10,
      deviceId: "device-B",
      payload: { amount_cents: 500000 },
    });

    const result = await resolver.resolveConflict(localEvent, remoteEvent);

    // DELETE wins despite lower lamport clock (3 < 10)
    expect(result.winner).toBe(localEvent);
    expect(result.winner.op).toBe("delete");
    expect(result.loser).toBe(remoteEvent);
    expect(result.strategy).toBe("delete-wins");
    expect(result.reason).toContain("DELETE operation always takes precedence");
  });

  it("should prioritize DELETE over UPDATE (DELETE is remote)", async () => {
    const localEvent = createMockEvent({
      entityId: "tx-del-2",
      op: "update",
      lamportClock: 10,
      deviceId: "device-A",
      payload: { amount_cents: 1000000 },
    });

    const remoteEvent = createMockEvent({
      entityId: "tx-del-2",
      op: "delete",
      lamportClock: 5,
      deviceId: "device-B",
      payload: {},
    });

    const result = await resolver.resolveConflict(localEvent, remoteEvent);

    // DELETE wins despite lower lamport clock (5 < 10)
    expect(result.winner).toBe(remoteEvent);
    expect(result.winner.op).toBe("delete");
    expect(result.loser).toBe(localEvent);
    expect(result.strategy).toBe("delete-wins");
    expect(result.reason).toContain("DELETE operation always takes precedence");
  });

  it("should use lamport clock when both are DELETE", async () => {
    const localEvent = createMockEvent({
      entityId: "tx-del-3",
      op: "delete",
      lamportClock: 7,
      deviceId: "device-A",
      payload: {},
    });

    const remoteEvent = createMockEvent({
      entityId: "tx-del-3",
      op: "delete",
      lamportClock: 5,
      deviceId: "device-B",
      payload: {},
    });

    const result = await resolver.resolveConflict(localEvent, remoteEvent);

    // Both are DELETE, use lamport clock (7 > 5)
    expect(result.winner).toBe(localEvent);
    expect(result.loser).toBe(remoteEvent);
    expect(result.strategy).toBe("delete-wins"); // DELETE-DELETE uses delete-wins strategy
    expect(result.reason).toContain("lamport clock");
    expect(result.reason).toContain("DELETE");
  });
});

// ============================================================================
// Test Suite: Determinism
// ============================================================================

describe("Conflict Resolution: Determinism", () => {
  it("should produce same result for same inputs (determinism)", async () => {
    const localEvent = createMockEvent({
      entityId: "tx-det",
      lamportClock: 5,
      deviceId: "device-A",
      payload: { amount_cents: 100000 },
    });

    const remoteEvent = createMockEvent({
      entityId: "tx-det",
      lamportClock: 3,
      deviceId: "device-B",
      payload: { amount_cents: 200000 },
    });

    // Run same resolution multiple times
    const results: Array<{
      winnerDevice: string;
      strategy: string;
      winnerLamport: number;
    }> = [];
    for (let i = 0; i < 5; i++) {
      const result = await resolver.resolveConflict(localEvent, remoteEvent);
      results.push({
        winnerDevice: result.winner.deviceId,
        strategy: result.strategy,
        winnerLamport: result.winner.lamportClock,
      });
    }

    // All results should be identical
    const allSame = results.every(
      (r) =>
        r.winnerDevice === results[0].winnerDevice &&
        r.strategy === results[0].strategy &&
        r.winnerLamport === results[0].winnerLamport
    );

    expect(allSame).toBe(true);
    expect(results[0].winnerDevice).toBe("device-A");
    expect(results[0].strategy).toBe("record-lww");
  });
});

// ============================================================================
// Test Suite: Commutativity
// ============================================================================

describe("Conflict Resolution: Commutativity", () => {
  it("should produce same winner regardless of argument order (commutativity)", async () => {
    const eventA = createMockEvent({
      entityId: "tx-comm",
      lamportClock: 5,
      deviceId: "device-A",
      payload: { amount_cents: 100000 },
    });

    const eventB = createMockEvent({
      entityId: "tx-comm",
      lamportClock: 3,
      deviceId: "device-B",
      payload: { amount_cents: 200000 },
    });

    // Resolve in both orders: A vs B, and B vs A
    const resultAB = await resolver.resolveConflict(eventA, eventB);
    const resultBA = await resolver.resolveConflict(eventB, eventA);

    // Both should pick the same winner
    expect(resultAB.winner.deviceId).toBe(resultBA.winner.deviceId);
    expect(resultAB.winner.lamportClock).toBe(resultBA.winner.lamportClock);
    expect(resultAB.strategy).toBe(resultBA.strategy);

    // Verify both picked eventA (higher lamport clock)
    expect(resultAB.winner).toBe(eventA);
    expect(resultBA.winner).toBe(eventA);
  });

  it("should be commutative for DELETE conflicts", async () => {
    const updateEvent = createMockEvent({
      entityId: "tx-comm-del",
      op: "update",
      lamportClock: 10,
      deviceId: "device-A",
      payload: { amount_cents: 500000 },
    });

    const deleteEvent = createMockEvent({
      entityId: "tx-comm-del",
      op: "delete",
      lamportClock: 5,
      deviceId: "device-B",
      payload: {},
    });

    // Resolve in both orders
    const result1 = await resolver.resolveConflict(updateEvent, deleteEvent);
    const result2 = await resolver.resolveConflict(deleteEvent, updateEvent);

    // Both should pick DELETE as winner
    expect(result1.winner.op).toBe("delete");
    expect(result2.winner.op).toBe("delete");
    expect(result1.winner.deviceId).toBe(result2.winner.deviceId);
    expect(result1.strategy).toBe("delete-wins");
    expect(result2.strategy).toBe("delete-wins");
  });

  it("should be commutative for tie-breaking with deviceId", async () => {
    const eventX = createMockEvent({
      entityId: "tx-tie",
      lamportClock: 5,
      deviceId: "device-xyz",
      payload: { description: "From XYZ" },
    });

    const eventA = createMockEvent({
      entityId: "tx-tie",
      lamportClock: 5,
      deviceId: "device-abc",
      payload: { description: "From ABC" },
    });

    // Resolve in both orders
    const resultXA = await resolver.resolveConflict(eventX, eventA);
    const resultAX = await resolver.resolveConflict(eventA, eventX);

    // Both should pick eventX (device-xyz > device-abc lexicographically)
    expect(resultXA.winner).toBe(eventX);
    expect(resultAX.winner).toBe(eventX);
    expect(resultXA.winner.deviceId).toBe(resultAX.winner.deviceId);
  });
});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

describe("Conflict Resolution: Edge Cases", () => {
  it("should handle CREATE vs UPDATE (treat as UPDATE vs UPDATE)", async () => {
    const createEvent = createMockEvent({
      entityId: "tx-edge",
      op: "create",
      lamportClock: 3,
      deviceId: "device-A",
      payload: { amount_cents: 100000 },
    });

    const updateEvent = createMockEvent({
      entityId: "tx-edge",
      op: "update",
      lamportClock: 5,
      deviceId: "device-B",
      payload: { amount_cents: 200000 },
    });

    const result = await resolver.resolveConflict(createEvent, updateEvent);

    // Higher lamport clock wins (UPDATE with lamport=5)
    expect(result.winner).toBe(updateEvent);
    expect(result.strategy).toBe("record-lww");
  });

  it("should handle identical events (same lamport and deviceId)", async () => {
    const event1 = createMockEvent({
      entityId: "tx-same",
      lamportClock: 5,
      deviceId: "device-A",
      payload: { amount_cents: 100000 },
    });

    const event2 = createMockEvent({
      entityId: "tx-same",
      lamportClock: 5,
      deviceId: "device-A",
      payload: { amount_cents: 100000 },
    });

    const result = await resolver.resolveConflict(event1, event2);

    // Same ordering string, local wins by default (order comparison)
    expect(result.strategy).toBe("record-lww");
    // Both have same clock and device, so either could win (implementation picks local)
    expect([event1, event2]).toContain(result.winner);
  });
});
