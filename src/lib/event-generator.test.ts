/**
 * Unit tests for EventGenerator
 *
 * Tests cover:
 * - Event creation with correct fields
 * - Event storage in Dexie (snake_case mapping)
 * - Lamport clock incrementing per entity
 * - Delta calculation (only changed fields)
 * - Vector clock initialization and updates
 * - Checksum generation
 * - Idempotency key format
 *
 * @module lib/event-generator.test
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eventGenerator } from "./event-generator";
import { db } from "./dexie/db";

describe("EventGenerator", () => {
  beforeEach(async () => {
    // Clear events and meta tables before each test
    await db.events.clear();
    await db.meta.clear();
  });

  afterEach(async () => {
    // Clean up after each test
    await db.events.clear();
    await db.meta.clear();
  });

  it("should create event with correct fields", async () => {
    const event = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-test-001",
      op: "create",
      payload: { amount_cents: 100000, description: "Test transaction" },
      userId: "12345678-1234-5678-1234-567812345001",
    });

    // Verify event structure
    expect(event.id).toBeDefined();
    expect(event.householdId).toBe("00000000-0000-0000-0000-000000000001"); // MVP default
    expect(event.entityType).toBe("transaction");
    expect(event.entityId).toBe("tx-test-001");
    expect(event.op).toBe("create");
    expect(event.payload).toEqual({ amount_cents: 100000, description: "Test transaction" });
    expect(event.actorUserId).toBe("12345678-1234-5678-1234-567812345001");
    expect(event.deviceId).toBeDefined(); // From deviceManager
    expect(event.idempotencyKey).toBeDefined();
    expect(event.eventVersion).toBe(1);
    expect(event.lamportClock).toBe(1); // First event for this entity
    expect(event.vectorClock).toBeDefined();
    expect(event.checksum).toBeDefined();
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it("should store event in Dexie with snake_case fields", async () => {
    await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-test-002",
      op: "create",
      payload: { amount_cents: 50000 },
      userId: "12345678-1234-5678-1234-567812345002",
    });

    // Query Dexie using snake_case field names
    const events = await db.events.where("entity_id").equals("tx-test-002").toArray();

    expect(events).toHaveLength(1);

    const storedEvent = events[0];
    expect(storedEvent.entity_type).toBe("transaction");
    expect(storedEvent.entity_id).toBe("tx-test-002");
    expect(storedEvent.op).toBe("create");
    expect(storedEvent.actor_user_id).toBe("12345678-1234-5678-1234-567812345002");
    expect(storedEvent.device_id).toBeDefined();
    expect(storedEvent.idempotency_key).toBeDefined();
    expect(storedEvent.event_version).toBe(1);
    expect(storedEvent.lamport_clock).toBe(1);
    expect(storedEvent.vector_clock).toBeDefined();
    expect(storedEvent.timestamp).toBeDefined();
  });

  it("should increment lamport clock per entity", async () => {
    const entityId = "tx-test-003";

    // Create first event
    const event1 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId,
      op: "create",
      payload: { amount_cents: 10000 },
      userId: "12345678-1234-5678-1234-567812345003",
    });

    // Small delay to ensure IndexedDB transaction commits
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Create second event for same entity
    const event2 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId,
      op: "update",
      payload: { amount_cents: 20000 },
      userId: "12345678-1234-5678-1234-567812345003",
    });

    // Small delay to ensure IndexedDB transaction commits
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Create third event for same entity
    const event3 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId,
      op: "update",
      payload: { description: "Updated" },
      userId: "12345678-1234-5678-1234-567812345003",
    });

    // Verify lamport clocks increment
    expect(event1.lamportClock).toBe(1);
    expect(event2.lamportClock).toBe(2);
    expect(event3.lamportClock).toBe(3);

    // Verify stored in Dexie correctly
    const storedEvents = await db.events
      .where("entity_id")
      .equals(entityId)
      .sortBy("lamport_clock"); // Sort by lamport clock to ensure correct order
    expect(storedEvents).toHaveLength(3);
    expect(storedEvents[0].lamport_clock).toBe(1);
    expect(storedEvents[1].lamport_clock).toBe(2);
    expect(storedEvents[2].lamport_clock).toBe(3);
  });

  it("should keep lamport clocks independent per entity", async () => {
    // Create event for entity A
    const eventA1 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-entity-A",
      op: "create",
      payload: { amount_cents: 10000 },
      userId: "12345678-1234-5678-1234-567812345004",
    });

    // Create event for entity B
    const eventB1 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-entity-B",
      op: "create",
      payload: { amount_cents: 20000 },
      userId: "12345678-1234-5678-1234-567812345004",
    });

    // Create another event for entity A
    const eventA2 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-entity-A",
      op: "update",
      payload: { amount_cents: 15000 },
      userId: "12345678-1234-5678-1234-567812345004",
    });

    // Both entities should start at 1 (independent clocks)
    expect(eventA1.lamportClock).toBe(1);
    expect(eventB1.lamportClock).toBe(1);

    // Entity A's second event should be 2
    expect(eventA2.lamportClock).toBe(2);
  });

  it("should calculate delta correctly (only changed fields)", () => {
    const oldValue = {
      amount_cents: 100000,
      description: "Old description",
      status: "pending",
      category_id: "cat-123",
    };

    const newValue = {
      amount_cents: 150000, // Changed
      description: "Old description", // Unchanged
      status: "cleared", // Changed
      category_id: "cat-123", // Unchanged
    };

    const delta = eventGenerator.calculateDelta(oldValue, newValue);

    // Only changed fields should be in delta
    expect(delta).toEqual({
      amount_cents: 150000,
      status: "cleared",
    });

    // Unchanged fields should NOT be in delta
    expect(delta.description).toBeUndefined();
    expect(delta.category_id).toBeUndefined();
  });

  it("should handle empty delta (no changes)", () => {
    const oldValue = { amount_cents: 100000, description: "Same" };
    const newValue = { amount_cents: 100000, description: "Same" };

    const delta = eventGenerator.calculateDelta(oldValue, newValue);

    // No changes = empty object
    expect(delta).toEqual({});
  });

  it("should initialize vector clock for first event", async () => {
    const event = await eventGenerator.createEvent({
      entityType: "account",
      entityId: "acc-test-001",
      op: "create",
      payload: { name: "Savings Account" },
      userId: "12345678-1234-5678-1234-567812345005",
    });

    // First event should have vector clock with single device entry
    expect(event.vectorClock).toBeDefined();
    expect(typeof event.vectorClock).toBe("object");

    // Should have exactly one device ID with value 1
    const deviceIds = Object.keys(event.vectorClock);
    expect(deviceIds.length).toBe(1);
    expect(event.vectorClock[deviceIds[0]]).toBe(1);
  });

  it("should update vector clock for subsequent events", async () => {
    const entityId = "acc-test-002";

    // Create first event
    const event1 = await eventGenerator.createEvent({
      entityType: "account",
      entityId,
      op: "create",
      payload: { name: "Checking Account" },
      userId: "12345678-1234-5678-1234-567812345006",
    });

    // Create second event
    const event2 = await eventGenerator.createEvent({
      entityType: "account",
      entityId,
      op: "update",
      payload: { name: "Updated Account" },
      userId: "12345678-1234-5678-1234-567812345006",
    });

    // Get device ID from first event
    const deviceId = Object.keys(event1.vectorClock)[0];

    // Vector clock should increment for this device
    expect(event1.vectorClock[deviceId]).toBe(1);
    expect(event2.vectorClock[deviceId]).toBe(2);
  });

  it("should generate valid checksum", async () => {
    const event = await eventGenerator.createEvent({
      entityType: "category",
      entityId: "cat-test-001",
      op: "create",
      payload: { name: "Groceries", color: "#FF5722" },
      userId: "12345678-1234-5678-1234-567812345007",
    });

    // Checksum should be a 64-character hex string (SHA-256)
    expect(event.checksum).toBeDefined();
    expect(event.checksum.length).toBe(64);
    expect(/^[a-f0-9]{64}$/.test(event.checksum)).toBe(true);
  });

  it("should generate different checksums for different payloads", async () => {
    const event1 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-checksum-001",
      op: "create",
      payload: { amount_cents: 10000 },
      userId: "12345678-1234-5678-1234-567812345008",
    });

    const event2 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-checksum-002",
      op: "create",
      payload: { amount_cents: 20000 }, // Different amount
      userId: "12345678-1234-5678-1234-567812345008",
    });

    // Different payloads should have different checksums
    expect(event1.checksum).not.toBe(event2.checksum);
  });

  it("should generate idempotency key in correct format", async () => {
    const event = await eventGenerator.createEvent({
      entityType: "budget",
      entityId: "bud-test-001",
      op: "create",
      payload: { amount_cents: 50000, month_key: "2025-01" },
      userId: "12345678-1234-5678-1234-567812345009",
    });

    // Idempotency key format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
    expect(event.idempotencyKey).toBeDefined();

    const parts = event.idempotencyKey.split("-");
    expect(parts.length).toBeGreaterThanOrEqual(4); // At least 4 parts

    // Last part should be lamport clock (number)
    const lastPart = parts[parts.length - 1];
    expect(parseInt(lastPart, 10)).toBe(event.lamportClock);

    // Should contain entity type
    expect(event.idempotencyKey).toContain("budget");

    // Should contain entity ID
    expect(event.idempotencyKey).toContain("bud-test-001");
  });

  it("should handle different entity types", async () => {
    // Test each entity type
    const entityTypes = ["transaction", "account", "category", "budget"] as const;

    for (const entityType of entityTypes) {
      const event = await eventGenerator.createEvent({
        entityType,
        entityId: `${entityType}-test-multi`,
        op: "create",
        payload: { test: true },
        userId: "12345678-1234-5678-1234-567812345010",
      });

      expect(event.entityType).toBe(entityType);
      expect(event.idempotencyKey).toContain(entityType);
    }

    // Verify all events stored
    const allEvents = await db.events.toArray();
    expect(allEvents.length).toBeGreaterThanOrEqual(4);
  });

  it("should handle different operations (create, update, delete)", async () => {
    const entityId = "tx-ops-test";

    // Create
    const createEvent = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId,
      op: "create",
      payload: { amount_cents: 10000 },
      userId: "12345678-1234-5678-1234-567812345011",
    });
    expect(createEvent.op).toBe("create");
    expect(createEvent.lamportClock).toBe(1);

    // Wait until event is queryable in Dexie
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Update
    const updateEvent = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId,
      op: "update",
      payload: { amount_cents: 20000 },
      userId: "12345678-1234-5678-1234-567812345011",
    });
    expect(updateEvent.op).toBe("update");
    expect(updateEvent.lamportClock).toBe(2);

    // Wait until event is queryable in Dexie
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Delete
    const deleteEvent = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId,
      op: "delete",
      payload: { deleted: true },
      userId: "12345678-1234-5678-1234-567812345011",
    });
    expect(deleteEvent.op).toBe("delete");
    expect(deleteEvent.lamportClock).toBe(3);

    // Verify all stored
    const events = await db.events.where("entity_id").equals(entityId).toArray();
    expect(events).toHaveLength(3);
  });
});
