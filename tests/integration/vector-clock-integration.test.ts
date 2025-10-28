import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eventGenerator } from "@/lib/event-generator";
import { compareVectorClocks } from "@/lib/vector-clock";
import { db } from "@/lib/dexie/db";

describe("Vector Clock Integration", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.close();
  });

  it("should include vector clock in generated event", async () => {
    const event = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-123",
      op: "create",
      payload: { amount: 1000 },
      userId: "user-456",
    });

    expect(event.lamportClock).toBe(1);
    expect(event.vectorClock).toBeDefined();
    expect(Object.keys(event.vectorClock).length).toBeGreaterThan(0);
  });

  it("should increment lamport clock for same entity", async () => {
    const event1 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-123",
      op: "create",
      payload: { amount: 1000 },
      userId: "user-456",
    });

    const event2 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-123",
      op: "update",
      payload: { amount: 2000 },
      userId: "user-456",
    });

    expect(event1.lamportClock).toBe(1);
    expect(event2.lamportClock).toBe(2);
  });

  it("should have independent clocks per entity", async () => {
    const eventA = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-A",
      op: "create",
      payload: {},
      userId: "user-456",
    });

    const eventB = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-B",
      op: "create",
      payload: {},
      userId: "user-456",
    });

    // Both should start at lamport clock 1
    expect(eventA.lamportClock).toBe(1);
    expect(eventB.lamportClock).toBe(1);
  });

  it("should detect sequential edits (no conflict)", async () => {
    // Simulate Device A edits
    const event1 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-123",
      op: "create",
      payload: { amount: 1000 },
      userId: "user-456",
    });

    // Simulate Device A edits again (sequential)
    const event2 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-123",
      op: "update",
      payload: { amount: 2000 },
      userId: "user-456",
    });

    // Compare clocks
    const comparison = compareVectorClocks(event2.vectorClock, event1.vectorClock);

    // Event2 should be ahead (no conflict)
    expect(comparison).toBe("local-ahead");
  });
});
