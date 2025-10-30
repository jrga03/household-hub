/**
 * Unit tests for Event Compactor
 *
 * Tests the event compaction system that prevents unbounded growth of the
 * event log in IndexedDB. Verifies dual triggers (100 events OR 30 days),
 * event replay, snapshot creation, and safety buffer preservation.
 *
 * @see src/lib/event-compactor.ts
 * @see docs/implementation/chunks/035-event-compaction/instructions.md
 */

import { describe, it, expect, beforeEach } from "vitest";
import { eventCompactor } from "./event-compactor";
import { db } from "./dexie/db";
import type { TransactionEvent } from "./dexie/db";
import { nanoid } from "nanoid";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test event with specified parameters.
 * Generates all required fields with sensible defaults.
 *
 * @param entityId - Entity identifier
 * @param lamportClock - Lamport clock value
 * @param op - Operation type
 * @param payload - Event payload (changed fields)
 * @returns Complete TransactionEvent object
 */
function createTestEvent(
  entityId: string,
  lamportClock: number,
  op: "create" | "update" | "delete" | "snapshot",
  payload: Record<string, unknown>
): TransactionEvent {
  return {
    id: nanoid(),
    household_id: "test-household",
    entity_id: entityId,
    entity_type: "transaction",
    op,
    payload,
    lamport_clock: lamportClock, // Dexie uses snake_case
    vector_clock: { "device-1": lamportClock },
    timestamp: new Date().toISOString(),
    device_id: "device-1",
    actor_user_id: "user-1",
    idempotency_key: `test-${entityId}-${lamportClock}`,
    event_version: 1,
  };
}

/**
 * Create multiple test events for an entity.
 * Useful for testing compaction thresholds.
 *
 * @param entityId - Entity identifier
 * @param count - Number of events to create
 * @returns Array of TransactionEvent objects
 */
async function createTestEvents(entityId: string, count: number): Promise<TransactionEvent[]> {
  const events: TransactionEvent[] = [];

  for (let i = 1; i <= count; i++) {
    const event = createTestEvent(entityId, i, i === 1 ? "create" : "update", {
      amount_cents: 100000 + i * 1000,
      description: `Event ${i}`,
    });
    events.push(event);
    await db.events.add(event);
  }

  return events;
}

// ============================================================================
// Setup and Teardown
// ============================================================================

beforeEach(async () => {
  // Clear entire database before each test
  await db.delete();
  await db.open();
});

// ============================================================================
// Test Suite: Compaction Triggers
// ============================================================================

describe("EventCompactor - Compaction Triggers", () => {
  it("should compact entity with 100+ events", async () => {
    const entityId = "tx-100-events";

    // Create 110 events for same entity
    await createTestEvents(entityId, 110);

    // Verify shouldCompact returns true
    const shouldCompact = await eventCompactor.shouldCompact(entityId);
    expect(shouldCompact).toBe(true);

    // Compact the entity
    const result = await eventCompactor.compactEntity(entityId);

    // Verify 100 events deleted (keeping last 10 + 1 snapshot)
    expect(result.eventsDeleted).toBe(100);
    expect(result.snapshotCreated).toBe(true);

    // Verify only 11 events remain (1 snapshot + 10 recent)
    const remainingEvents = await db.events.where("entity_id").equals(entityId).count();
    expect(remainingEvents).toBe(11);

    // Verify snapshot exists
    const snapshot = await db.events
      .where("entity_id")
      .equals(entityId)
      .and((event) => event.op === "snapshot")
      .first();
    expect(snapshot).toBeDefined();
    expect(snapshot?.op).toBe("snapshot");
  });

  it("should NOT compact entity with <= 10 events (safety buffer)", async () => {
    const entityId = "tx-few-events";

    // Create only 10 events
    await createTestEvents(entityId, 10);

    // Verify shouldCompact returns false (not enough events)
    const shouldCompact = await eventCompactor.shouldCompact(entityId);
    expect(shouldCompact).toBe(false);

    // Attempting compaction should skip
    const result = await eventCompactor.compactEntity(entityId);
    expect(result.eventsDeleted).toBe(0);
    expect(result.snapshotCreated).toBe(false);

    // All events should remain
    const remainingEvents = await db.events.where("entity_id").equals(entityId).count();
    expect(remainingEvents).toBe(10);
  });

  it("should NOT compact entity with < 100 events (below threshold)", async () => {
    const entityId = "tx-below-threshold";

    // Create 50 events (below threshold but above safety buffer)
    await createTestEvents(entityId, 50);

    // Verify shouldCompact returns false
    const shouldCompact = await eventCompactor.shouldCompact(entityId);
    expect(shouldCompact).toBe(false);
  });

  it("should trigger compaction at exactly 100 events", async () => {
    const entityId = "tx-exactly-100";

    // Create exactly 100 events
    await createTestEvents(entityId, 100);

    // Verify shouldCompact returns true (threshold met)
    const shouldCompact = await eventCompactor.shouldCompact(entityId);
    expect(shouldCompact).toBe(true);
  });

  it("should trigger compaction after 30 days since last compaction", async () => {
    const entityId = "tx-time-threshold";

    // Create 50 events (below event threshold but above safety buffer)
    await createTestEvents(entityId, 50);

    // Simulate last compaction 31 days ago
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    await db.meta.put({
      key: `compaction:${entityId}`,
      value: {
        timestamp: thirtyOneDaysAgo.toISOString(),
        eventsDeleted: 0,
        eventsRemaining: 50,
      },
    });

    // Verify shouldCompact returns true (time threshold met)
    const shouldCompact = await eventCompactor.shouldCompact(entityId);
    expect(shouldCompact).toBe(true);
  });
});

// ============================================================================
// Test Suite: Event Replay
// ============================================================================

describe("EventCompactor - Event Replay", () => {
  it("should replay create → update → update sequence correctly", async () => {
    const entityId = "tx-replay-sequence";

    // Create event: Initial state
    const createEvent = createTestEvent(entityId, 1, "create", {
      amount_cents: 100000,
      description: "Initial",
      account_id: "acc-1",
    });

    // Update event 1: Change amount (partial update)
    const updateEvent1 = createTestEvent(entityId, 2, "update", {
      amount_cents: 150000,
    });

    // Update event 2: Change description (partial update)
    const updateEvent2 = createTestEvent(entityId, 3, "update", {
      description: "Updated",
    });

    await db.events.bulkAdd([createEvent, updateEvent1, updateEvent2]);

    // Use private method to replay events (type assertion for testing)
    const compactor = eventCompactor as {
      replayEvents: (events: unknown[]) => { state: Record<string, unknown> };
    };
    const snapshot = compactor.replayEvents([createEvent, updateEvent1, updateEvent2]);

    // Verify final state has merged all changes
    expect(snapshot.state).toEqual({
      amount_cents: 150000, // From updateEvent1
      description: "Updated", // From updateEvent2
      account_id: "acc-1", // From createEvent (preserved)
    });

    // Verify lamportClock is max value
    expect(snapshot.lamportClock).toBe(3);

    // Verify vectorClock includes all devices
    expect(snapshot.vectorClock).toEqual({ "device-1": 3 });
  });

  it("should handle deleted entity with tombstone markers", async () => {
    const entityId = "tx-deleted";

    // Create event
    const createEvent = createTestEvent(entityId, 1, "create", {
      amount_cents: 100000,
      description: "Created",
    });

    // Update event
    const updateEvent = createTestEvent(entityId, 2, "update", {
      description: "Updated before delete",
    });

    // Delete event
    const deleteEvent = createTestEvent(entityId, 3, "delete", {});

    await db.events.bulkAdd([createEvent, updateEvent, deleteEvent]);

    // Replay events
    const compactor = eventCompactor as {
      replayEvents: (events: unknown[]) => { state: Record<string, unknown> };
    };
    const snapshot = compactor.replayEvents([createEvent, updateEvent, deleteEvent]);

    // Verify tombstone markers added
    expect(snapshot.state.deleted).toBe(true);
    expect(snapshot.state.deletedAt).toBeDefined();
    expect(typeof snapshot.state.deletedAt).toBe("string");

    // Verify original fields still present
    expect(snapshot.state.amount_cents).toBe(100000);
    expect(snapshot.state.description).toBe("Updated before delete");
  });

  it("should handle existing snapshot events", async () => {
    const entityId = "tx-existing-snapshot";

    // Existing snapshot from previous compaction
    const oldSnapshot = createTestEvent(entityId, 5, "snapshot", {
      amount_cents: 100000,
      description: "Previous state",
      account_id: "acc-1",
    });

    // New update after snapshot
    const updateEvent = createTestEvent(entityId, 6, "update", {
      description: "Updated after snapshot",
    });

    await db.events.bulkAdd([oldSnapshot, updateEvent]);

    // Replay events
    const compactor = eventCompactor as {
      replayEvents: (events: unknown[]) => { state: Record<string, unknown> };
    };
    const snapshot = compactor.replayEvents([oldSnapshot, updateEvent]);

    // Verify snapshot replaced old state and then updated
    expect(snapshot.state).toEqual({
      amount_cents: 100000,
      description: "Updated after snapshot",
      account_id: "acc-1",
    });
  });

  it("should merge vector clocks across all events", async () => {
    const entityId = "tx-vector-merge";

    // Event from device-1
    const event1: TransactionEvent = {
      ...createTestEvent(entityId, 1, "create", { amount_cents: 100000 }),
      vector_clock: { "device-1": 1 },
    };

    // Event from device-2
    const event2: TransactionEvent = {
      ...createTestEvent(entityId, 2, "update", { description: "Device 2 update" }),
      vector_clock: { "device-1": 1, "device-2": 1 },
    };

    // Event from device-3
    const event3: TransactionEvent = {
      ...createTestEvent(entityId, 3, "update", { amount_cents: 150000 }),
      vector_clock: { "device-1": 1, "device-2": 1, "device-3": 1 },
    };

    await db.events.bulkAdd([event1, event2, event3]);

    // Replay events
    const compactor = eventCompactor as {
      replayEvents: (events: unknown[]) => {
        state: Record<string, unknown>;
        vectorClock: Record<string, number>;
      };
    };
    const snapshot = compactor.replayEvents([event1, event2, event3]);

    // Verify merged vector clock has all devices at max values
    expect(snapshot.vectorClock).toEqual({
      "device-1": 1,
      "device-2": 1,
      "device-3": 1,
    });
  });
});

// ============================================================================
// Test Suite: Snapshot Creation
// ============================================================================

describe("EventCompactor - Snapshot Creation", () => {
  it("should create snapshot with correct structure", async () => {
    const entityId = "tx-snapshot-structure";

    // Create 110 events
    await createTestEvents(entityId, 110);

    // Compact
    await eventCompactor.compactEntity(entityId);

    // Query for snapshot
    const snapshot = await db.events
      .where("entity_id")
      .equals(entityId)
      .and((event) => event.op === "snapshot")
      .first();

    // Verify snapshot exists
    expect(snapshot).toBeDefined();

    // Verify snapshot structure
    expect(snapshot?.op).toBe("snapshot");
    expect(snapshot?.payload).toBeDefined();
    expect(typeof snapshot?.payload).toBe("object");

    // Verify lamportClock is max from all events (110)
    expect(snapshot?.lamport_clock).toBe(110);

    // Verify deviceId is system compactor
    expect(snapshot?.device_id).toBe("system-compactor");

    // Verify idempotencyKey starts with "snapshot-"
    expect(snapshot?.idempotency_key).toMatch(/^snapshot-/);

    // Verify payload contains final state
    expect(snapshot?.payload.amount_cents).toBe(100000 + 110 * 1000); // Last event's amount
    expect(snapshot?.payload.description).toBe("Event 110"); // Last event's description
  });

  it("should preserve household_id and entity_type in snapshot", async () => {
    const entityId = "tx-preserve-metadata";

    // Create events with specific household_id
    const events = await createTestEvents(entityId, 110);
    const firstEvent = events[0];

    // Compact
    await eventCompactor.compactEntity(entityId);

    // Get snapshot
    const snapshot = await db.events
      .where("entity_id")
      .equals(entityId)
      .and((event) => event.op === "snapshot")
      .first();

    // Verify metadata preserved
    expect(snapshot?.household_id).toBe(firstEvent.household_id);
    expect(snapshot?.entity_type).toBe(firstEvent.entity_type);
    expect(snapshot?.actor_user_id).toBe(firstEvent.actor_user_id);
  });

  it("should create snapshot with ISO timestamp", async () => {
    const entityId = "tx-snapshot-timestamp";

    await createTestEvents(entityId, 110);
    await eventCompactor.compactEntity(entityId);

    const snapshot = await db.events
      .where("entity_id")
      .equals(entityId)
      .and((event) => event.op === "snapshot")
      .first();

    // Verify timestamp is ISO string
    expect(snapshot?.timestamp).toBeDefined();
    expect(typeof snapshot?.timestamp).toBe("string");

    // Verify it's a valid ISO timestamp
    const timestamp = new Date(snapshot!.timestamp);
    expect(timestamp.toISOString()).toBe(snapshot?.timestamp);
  });
});

// ============================================================================
// Test Suite: Safety Buffer Preservation
// ============================================================================

describe("EventCompactor - Safety Buffer", () => {
  it("should preserve last 10 events (safety buffer)", async () => {
    const entityId = "tx-safety-buffer";

    // Create 150 events
    await createTestEvents(entityId, 150);

    // Compact
    const result = await eventCompactor.compactEntity(entityId);

    // Verify events deleted: 150 - 10 safety buffer = 140
    expect(result.eventsDeleted).toBe(140);

    // Verify 11 events remain (1 snapshot + 10 recent)
    const remainingEvents = await db.events.where("entity_id").equals(entityId).count();
    expect(remainingEvents).toBe(11);
  });

  it("should keep events with highest lamport clocks", async () => {
    const entityId = "tx-recent-events";

    // Create 150 events
    await createTestEvents(entityId, 150);

    // Compact
    await eventCompactor.compactEntity(entityId);

    // Get remaining non-snapshot events
    const remainingEvents = await db.events
      .where("entity_id")
      .equals(entityId)
      .and((event) => event.op !== "snapshot")
      .sortBy("lamport_clock");

    // Verify exactly 10 events remain
    expect(remainingEvents.length).toBe(10);

    // Verify they are the last 10 events (lamport clock 141-150)
    expect(remainingEvents[0].lamport_clock).toBe(141);
    expect(remainingEvents[9].lamport_clock).toBe(150);
  });

  it("should delete old events while preserving recent ones", async () => {
    const entityId = "tx-delete-old";

    // Create 110 events
    const allEvents = await createTestEvents(entityId, 110);

    // Compact
    await eventCompactor.compactEntity(entityId);

    // Verify first 100 events were deleted
    for (let i = 0; i < 100; i++) {
      const event = await db.events.get(allEvents[i].id);
      expect(event).toBeUndefined();
    }

    // Verify last 10 events still exist
    for (let i = 100; i < 110; i++) {
      const event = await db.events.get(allEvents[i].id);
      expect(event).toBeDefined();
    }
  });
});

// ============================================================================
// Test Suite: CompactAll Statistics
// ============================================================================

describe("EventCompactor - CompactAll", () => {
  it("should compact all eligible entities and return stats", async () => {
    // Create events for 5 different entities (110 each)
    const entityIds = ["tx-1", "tx-2", "tx-3", "tx-4", "tx-5"];

    for (const entityId of entityIds) {
      await createTestEvents(entityId, 110);
    }

    // Compact all
    const stats = await eventCompactor.compactAll();

    // Verify stats
    expect(stats.entitiesCompacted).toBeGreaterThanOrEqual(5);
    expect(stats.eventsDeleted).toBeGreaterThanOrEqual(500); // 5 entities * 100 events each
    expect(stats.snapshotsCreated).toBeGreaterThanOrEqual(5);
    expect(stats.duration).toBeGreaterThan(0);
    expect(stats.storageSaved).toBeGreaterThan(0);
  });

  it("should skip entities below threshold in compactAll", async () => {
    // Create mix of entities: 2 above threshold, 2 below
    await createTestEvents("tx-above-1", 110);
    await createTestEvents("tx-above-2", 120);
    await createTestEvents("tx-below-1", 50);
    await createTestEvents("tx-below-2", 30);

    // Compact all
    const stats = await eventCompactor.compactAll();

    // Only 2 entities should be compacted
    expect(stats.entitiesCompacted).toBe(2);
    expect(stats.snapshotsCreated).toBe(2);

    // Verify below-threshold entities still have all events
    const below1Count = await db.events.where("entity_id").equals("tx-below-1").count();
    const below2Count = await db.events.where("entity_id").equals("tx-below-2").count();
    expect(below1Count).toBe(50);
    expect(below2Count).toBe(30);
  });

  it("should return zero stats when no entities need compaction", async () => {
    // Create entities all below threshold
    await createTestEvents("tx-1", 50);
    await createTestEvents("tx-2", 30);

    // Compact all
    const stats = await eventCompactor.compactAll();

    // Verify zero stats
    expect(stats.entitiesCompacted).toBe(0);
    expect(stats.eventsDeleted).toBe(0);
    expect(stats.snapshotsCreated).toBe(0);
    expect(stats.duration).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Test Suite: Compaction History
// ============================================================================

describe("EventCompactor - Compaction History", () => {
  it("should record compaction metadata in meta table", async () => {
    const entityId = "tx-history";

    // Create and compact entity
    await createTestEvents(entityId, 110);
    await eventCompactor.compactEntity(entityId);

    // Query metadata
    const metadata = await eventCompactor.getCompactionHistory(entityId);

    // Verify metadata structure
    expect(metadata).toBeDefined();
    expect(metadata?.timestamp).toBeDefined();
    expect(typeof metadata?.timestamp).toBe("string");
    expect(metadata?.eventsDeleted).toBe(100);
    expect(metadata?.eventsRemaining).toBe(11); // 1 snapshot + 10 recent
  });

  it("should return undefined for never-compacted entity", async () => {
    const entityId = "tx-never-compacted";

    // Query metadata for non-existent entity
    const metadata = await eventCompactor.getCompactionHistory(entityId);

    expect(metadata).toBeUndefined();
  });

  it("should update metadata on subsequent compactions", async () => {
    const entityId = "tx-multi-compact";

    // First compaction
    await createTestEvents(entityId, 110);
    await eventCompactor.compactEntity(entityId);

    const firstMetadata = await eventCompactor.getCompactionHistory(entityId);
    const firstTimestamp = firstMetadata?.timestamp;

    // Wait a bit and add more events
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Add 100 more events (now have 11 from first compaction + 100 new = 111)
    for (let i = 111; i <= 210; i++) {
      await db.events.add(
        createTestEvent(entityId, i, "update", {
          amount_cents: 100000 + i * 1000,
        })
      );
    }

    // Second compaction
    await eventCompactor.compactEntity(entityId);

    const secondMetadata = await eventCompactor.getCompactionHistory(entityId);

    // Verify timestamp updated
    expect(secondMetadata?.timestamp).toBeDefined();
    expect(secondMetadata?.timestamp).not.toBe(firstTimestamp);

    // Verify new stats
    expect(secondMetadata?.eventsDeleted).toBeGreaterThan(0);
    expect(secondMetadata?.eventsRemaining).toBe(11);
  });

  it("should retrieve all compaction history records", async () => {
    // Compact multiple entities
    await createTestEvents("tx-1", 110);
    await createTestEvents("tx-2", 120);
    await createTestEvents("tx-3", 130);

    await eventCompactor.compactEntity("tx-1");
    await eventCompactor.compactEntity("tx-2");
    await eventCompactor.compactEntity("tx-3");

    // Get all history
    const allHistory = await eventCompactor.getAllCompactionHistory();

    // Verify all 3 entities present
    expect(allHistory.length).toBeGreaterThanOrEqual(3);

    // Verify structure includes entityId
    const tx1History = allHistory.find((h) => h.entityId === "tx-1");
    expect(tx1History).toBeDefined();
    expect(tx1History?.timestamp).toBeDefined();
    expect(tx1History?.eventsDeleted).toBe(100);
  });
});

// ============================================================================
// Test Suite: Edge Cases and Error Handling
// ============================================================================

describe("EventCompactor - Edge Cases", () => {
  it("should handle entity with exactly 11 events (safety buffer + 1)", async () => {
    const entityId = "tx-edge-11";

    // Create 11 events (just above safety buffer)
    await createTestEvents(entityId, 11);

    // Should NOT compact (need > 10 for meaningful compaction)
    const shouldCompact = await eventCompactor.shouldCompact(entityId);
    expect(shouldCompact).toBe(false);
  });

  it("should handle empty entity (no events)", async () => {
    const entityId = "tx-empty";

    // Check if should compact (no events)
    const shouldCompact = await eventCompactor.shouldCompact(entityId);
    expect(shouldCompact).toBe(false);

    // Attempting compaction should skip
    const result = await eventCompactor.compactEntity(entityId);
    expect(result.eventsDeleted).toBe(0);
    expect(result.snapshotCreated).toBe(false);
  });

  it("should handle compaction of already-compacted entity", async () => {
    const entityId = "tx-recompact";

    // First compaction
    await createTestEvents(entityId, 110);
    await eventCompactor.compactEntity(entityId);

    // Should not compact again (only 11 events remain)
    const shouldCompact = await eventCompactor.shouldCompact(entityId);
    expect(shouldCompact).toBe(false);
  });

  it("should handle events with partial payloads correctly", async () => {
    const entityId = "tx-partial-payloads";

    // Create event with full payload
    await db.events.add(
      createTestEvent(entityId, 1, "create", {
        amount_cents: 100000,
        description: "Full",
        account_id: "acc-1",
        category_id: "cat-1",
      })
    );

    // Add 109 updates with partial payloads
    for (let i = 2; i <= 110; i++) {
      await db.events.add(
        createTestEvent(entityId, i, "update", {
          description: `Update ${i}`, // Only description
        })
      );
    }

    // Compact
    await eventCompactor.compactEntity(entityId);

    // Get snapshot
    const snapshot = await db.events
      .where("entity_id")
      .equals(entityId)
      .and((event) => event.op === "snapshot")
      .first();

    // Verify all fields preserved
    expect(snapshot?.payload.amount_cents).toBe(100000); // From create
    expect(snapshot?.payload.description).toBe("Update 110"); // From last update
    expect(snapshot?.payload.account_id).toBe("acc-1"); // From create
    expect(snapshot?.payload.category_id).toBe("cat-1"); // From create
  });
});
