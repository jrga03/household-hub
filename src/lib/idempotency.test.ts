import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { idempotencyGenerator } from "./idempotency";
import { db } from "./dexie/db";

describe("IdempotencyKeyGenerator", () => {
  describe("generateKey", () => {
    it("should generate deterministic keys", () => {
      const key1 = idempotencyGenerator.generateKey("device-abc", "transaction", "tx-123", 1);

      const key2 = idempotencyGenerator.generateKey("device-abc", "transaction", "tx-123", 1);

      expect(key1).toBe(key2);
      expect(key1).toBe("device-abc-transaction-tx-123-1");
    });

    it("should generate unique keys for different inputs", () => {
      const key1 = idempotencyGenerator.generateKey("device-abc", "transaction", "tx-123", 1);

      const key2 = idempotencyGenerator.generateKey("device-abc", "transaction", "tx-123", 2);

      const key3 = idempotencyGenerator.generateKey("device-xyz", "transaction", "tx-123", 1);

      expect(key1).not.toBe(key2); // Different lamport clock
      expect(key1).not.toBe(key3); // Different device
    });

    it("should handle special characters", () => {
      const key = idempotencyGenerator.generateKey(
        "device-abc",
        "transaction",
        "tx-with-dashes-123",
        1
      );

      expect(key).toBe("device-abc-transaction-tx-with-dashes-123-1");
    });
  });

  describe("getNextLamportClock", () => {
    beforeEach(async () => {
      await db.events.clear();
    });

    afterEach(async () => {
      await db.events.clear();
    });

    it("should return 1 for new entity", async () => {
      const clock = await idempotencyGenerator.getNextLamportClock("new-entity");

      expect(clock).toBe(1);
    });

    it("should increment existing clock", async () => {
      // Add event with lamport clock 1
      await db.events.add({
        id: "event-1",
        entity_id: "test-entity",
        entity_type: "transaction",
        op: "create",
        lamport_clock: 1,
        vector_clock: {},
        payload: {},
        timestamp: Date.now().toString(),
        device_id: "device-abc",
        actor_user_id: "user-123",
        idempotency_key: "key-1",
        event_version: 1,
        household_id: "00000000-0000-0000-0000-000000000001",
      });

      const clock = await idempotencyGenerator.getNextLamportClock("test-entity");

      expect(clock).toBe(2);
    });

    it("should return max + 1 for multiple events", async () => {
      // Add multiple events
      await db.events.bulkAdd([
        {
          id: "event-1",
          entity_id: "test-entity",
          lamport_clock: 1,
          entity_type: "transaction",
          op: "create",
          vector_clock: {},
          payload: {},
          timestamp: Date.now().toString(),
          device_id: "device-abc",
          actor_user_id: "user-123",
          idempotency_key: "key-1",
          event_version: 1,
          household_id: "00000000-0000-0000-0000-000000000001",
        },
        {
          id: "event-2",
          entity_id: "test-entity",
          lamport_clock: 2,
          entity_type: "transaction",
          op: "update",
          vector_clock: {},
          payload: {},
          timestamp: Date.now().toString(),
          device_id: "device-abc",
          actor_user_id: "user-123",
          idempotency_key: "key-2",
          event_version: 1,
          household_id: "00000000-0000-0000-0000-000000000001",
        },
        {
          id: "event-3",
          entity_id: "test-entity",
          lamport_clock: 3,
          entity_type: "transaction",
          op: "update",
          vector_clock: {},
          payload: {},
          timestamp: Date.now().toString(),
          device_id: "device-abc",
          actor_user_id: "user-123",
          idempotency_key: "key-3",
          event_version: 1,
          household_id: "00000000-0000-0000-0000-000000000001",
        },
      ]);

      const clock = await idempotencyGenerator.getNextLamportClock("test-entity");

      expect(clock).toBe(4);
    });

    it("should handle independent clocks per entity", async () => {
      // Add events for different entities
      await db.events.bulkAdd([
        {
          id: "event-1",
          entity_id: "entity-A",
          lamport_clock: 5,
          entity_type: "transaction",
          op: "create",
          vector_clock: {},
          payload: {},
          timestamp: Date.now().toString(),
          device_id: "device-abc",
          actor_user_id: "user-123",
          idempotency_key: "key-a",
          event_version: 1,
          household_id: "00000000-0000-0000-0000-000000000001",
        },
        {
          id: "event-2",
          entity_id: "entity-B",
          lamport_clock: 2,
          entity_type: "transaction",
          op: "create",
          vector_clock: {},
          payload: {},
          timestamp: Date.now().toString(),
          device_id: "device-abc",
          actor_user_id: "user-123",
          idempotency_key: "key-b",
          event_version: 1,
          household_id: "00000000-0000-0000-0000-000000000001",
        },
      ]);

      const clockA = await idempotencyGenerator.getNextLamportClock("entity-A");
      const clockB = await idempotencyGenerator.getNextLamportClock("entity-B");

      expect(clockA).toBe(6); // 5 + 1
      expect(clockB).toBe(3); // 2 + 1
    });
  });

  describe("calculateChecksum", () => {
    it("should generate consistent checksums", async () => {
      const payload = { amount: 1000, description: "Test" };

      const checksum1 = await idempotencyGenerator.calculateChecksum(payload);
      const checksum2 = await idempotencyGenerator.calculateChecksum(payload);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64); // SHA-256 is 64 hex chars
    });

    it("should ignore key order", async () => {
      const payload1 = { amount: 1000, description: "Test" };
      const payload2 = { description: "Test", amount: 1000 }; // Different order

      const checksum1 = await idempotencyGenerator.calculateChecksum(payload1);
      const checksum2 = await idempotencyGenerator.calculateChecksum(payload2);

      expect(checksum1).toBe(checksum2);
    });

    it("should ignore timestamps", async () => {
      const payload1 = { amount: 1000, created_at: "2024-01-01", updated_at: "2024-01-02" };

      const payload2 = { amount: 1000, created_at: "2024-02-01", updated_at: "2024-02-02" };

      const checksum1 = await idempotencyGenerator.calculateChecksum(payload1);
      const checksum2 = await idempotencyGenerator.calculateChecksum(payload2);

      expect(checksum1).toBe(checksum2);
    });

    it("should detect payload changes", async () => {
      const payload1 = { amount: 1000 };
      const payload2 = { amount: 2000 };

      const checksum1 = await idempotencyGenerator.calculateChecksum(payload1);
      const checksum2 = await idempotencyGenerator.calculateChecksum(payload2);

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe("Vector Clock", () => {
    it("should initialize vector clock", () => {
      const clock = idempotencyGenerator.initVectorClock("device-abc");

      expect(clock).toEqual({ "device-abc": 1 });
    });

    it("should update vector clock", () => {
      const current = { "device-abc": 1, "device-xyz": 2 };

      const updated = idempotencyGenerator.updateVectorClock(current, "device-abc");

      expect(updated).toEqual({ "device-abc": 2, "device-xyz": 2 });
    });

    it("should add new device to vector clock", () => {
      const current = { "device-abc": 1 };

      const updated = idempotencyGenerator.updateVectorClock(current, "device-xyz");

      expect(updated).toEqual({ "device-abc": 1, "device-xyz": 1 });
    });
  });
});
