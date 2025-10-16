# Instructions: Idempotency Keys

Follow these steps in order. Estimated time: 1 hour.

---

## Step 1: Create Event Type Definitions (5 min)

Create `src/types/event.ts`:

```typescript
import type { DevicePlatform } from "./device";

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
  entityType: EntityType;
  entityId: string;
  op: EventOp;
  payload: any; // Changed fields (full for create, delta for update)

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
```

---

## Step 2: Create Idempotency Key Generator - Part 1 (15 min)

Create `src/lib/idempotency.ts`:

```typescript
import { db } from "./dexie";
import { deviceManager } from "./device-manager";
import type { EntityType, VectorClock } from "@/types/event";

/**
 * IdempotencyKeyGenerator creates deterministic keys for events
 *
 * Key format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
 *
 * This ensures:
 * - Same mutation always generates same key (idempotent)
 * - Different devices generate different keys
 * - Events ordered by lamport clock per entity
 */
export class IdempotencyKeyGenerator {
  /**
   * Generate idempotency key
   *
   * @param deviceId Device ID from DeviceManager
   * @param entityType Type of entity (transaction, account, etc.)
   * @param entityId ID of specific entity
   * @param lamportClock Logical timestamp for this entity
   * @returns Deterministic idempotency key
   */
  generateKey(
    deviceId: string,
    entityType: EntityType,
    entityId: string,
    lamportClock: number
  ): string {
    // Format: device-entity_type-entity_id-clock
    return `${deviceId}-${entityType}-${entityId}-${lamportClock}`;
  }

  /**
   * Get next lamport clock for entity
   *
   * Queries events table for highest lamport_clock for this entity,
   * then increments by 1.
   *
   * @param entityId Entity ID to query
   * @returns Next lamport clock value (1 if no events exist)
   */
  async getNextLamportClock(entityId: string): Promise<number> {
    try {
      // Query events for this entity, ordered by lamport_clock descending
      const events = await db.events
        .where("entityId")
        .equals(entityId)
        .reverse() // Descending order
        .limit(1)
        .toArray();

      if (events.length === 0) {
        // No events for this entity yet
        return 1;
      }

      // Increment highest clock
      const maxClock = events[0].lamportClock;
      return maxClock + 1;
    } catch (error) {
      console.error("Failed to get lamport clock:", error);
      // Fallback to 1 if query fails
      return 1;
    }
  }

  /**
   * Calculate checksum for payload
   *
   * @param payload Event payload (any JSON-serializable object)
   * @returns SHA-256 hex string
   */
  async calculateChecksum(payload: any): Promise<string> {
    // Normalize payload for consistent hashing
    const normalized = this.normalizePayload(payload);
    const json = JSON.stringify(normalized);

    // Use Web Crypto API for SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return hashHex;
  }

  /**
   * Normalize payload for consistent checksum
   *
   * - Sorts object keys alphabetically
   * - Removes timestamp fields (updated_at, created_at)
   * - Recursively normalizes nested objects
   *
   * @param obj Payload to normalize
   * @returns Normalized payload
   */
  private normalizePayload(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      return obj.map((item) => this.normalizePayload(item));
    }

    // Sort keys and exclude timestamps
    const sorted: any = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        if (key !== "updated_at" && key !== "created_at") {
          sorted[key] = this.normalizePayload(obj[key]);
        }
      });

    return sorted;
  }

  /**
   * Initialize vector clock for new entity
   *
   * @param deviceId Current device ID
   * @returns Vector clock with single entry
   */
  initVectorClock(deviceId: string): VectorClock {
    return {
      [deviceId]: 1,
    };
  }

  /**
   * Update vector clock for existing entity
   *
   * @param currentClock Current vector clock
   * @param deviceId Current device ID
   * @returns Updated vector clock
   */
  updateVectorClock(currentClock: VectorClock, deviceId: string): VectorClock {
    const updated = { ...currentClock };
    updated[deviceId] = (updated[deviceId] || 0) + 1;
    return updated;
  }
}

// Singleton instance
export const idempotencyGenerator = new IdempotencyKeyGenerator();
```

---

## Step 3: Create Unit Tests (20 min)

Create `src/lib/idempotency.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { idempotencyGenerator } from "./idempotency";
import { db } from "./dexie";

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
        entityId: "test-entity",
        entityType: "transaction",
        op: "create",
        lamportClock: 1,
        vectorClock: {},
        payload: {},
        timestamp: Date.now(),
        deviceId: "device-abc",
        actorUserId: "user-123",
        idempotencyKey: "key-1",
        eventVersion: 1,
        checksum: "abc",
      });

      const clock = await idempotencyGenerator.getNextLamportClock("test-entity");

      expect(clock).toBe(2);
    });

    it("should return max + 1 for multiple events", async () => {
      // Add multiple events
      await db.events.bulkAdd([
        {
          id: "event-1",
          entityId: "test-entity",
          lamportClock: 1,
          entityType: "transaction",
          op: "create",
          vectorClock: {},
          payload: {},
          timestamp: Date.now(),
          deviceId: "device-abc",
          actorUserId: "user-123",
          idempotencyKey: "key-1",
          eventVersion: 1,
          checksum: "abc",
        },
        {
          id: "event-2",
          entityId: "test-entity",
          lamportClock: 2,
          entityType: "transaction",
          op: "update",
          vectorClock: {},
          payload: {},
          timestamp: Date.now(),
          deviceId: "device-abc",
          actorUserId: "user-123",
          idempotencyKey: "key-2",
          eventVersion: 1,
          checksum: "def",
        },
        {
          id: "event-3",
          entityId: "test-entity",
          lamportClock: 3,
          entityType: "transaction",
          op: "update",
          vectorClock: {},
          payload: {},
          timestamp: Date.now(),
          deviceId: "device-abc",
          actorUserId: "user-123",
          idempotencyKey: "key-3",
          eventVersion: 1,
          checksum: "ghi",
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
          entityId: "entity-A",
          lamportClock: 5,
          entityType: "transaction",
          op: "create",
          vectorClock: {},
          payload: {},
          timestamp: Date.now(),
          deviceId: "device-abc",
          actorUserId: "user-123",
          idempotencyKey: "key-a",
          eventVersion: 1,
          checksum: "abc",
        },
        {
          id: "event-2",
          entityId: "entity-B",
          lamportClock: 2,
          entityType: "transaction",
          op: "create",
          vectorClock: {},
          payload: {},
          timestamp: Date.now(),
          deviceId: "device-abc",
          actorUserId: "user-123",
          idempotencyKey: "key-b",
          eventVersion: 1,
          checksum: "def",
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
```

**Run tests**:

```bash
npm test src/lib/idempotency.test.ts
```

---

## Step 4: Export Utilities (2 min)

Update `src/lib/index.ts`:

```typescript
// Idempotency
export { idempotencyGenerator, IdempotencyKeyGenerator } from "./idempotency";
export type { EntityType, EventOp, VectorClock, TransactionEvent } from "@/types/event";
```

---

## Step 5: Test Integration (10 min)

Create `src/routes/test-idempotency.tsx`:

```typescript
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { idempotencyGenerator } from "@/lib/idempotency";
import { deviceManager } from "@/lib/device-manager";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/test-idempotency")({
  component: TestIdempotency,
});

function TestIdempotency() {
  const [deviceId, setDeviceId] = useState("");
  const [entityId, setEntityId] = useState("test-tx-123");
  const [lamportClock, setLamportClock] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [checksum, setChecksum] = useState("");

  useEffect(() => {
    deviceManager.getDeviceId().then(setDeviceId);
  }, []);

  const generateKey = async () => {
    const clock = await idempotencyGenerator.getNextLamportClock(entityId);
    setLamportClock(clock);

    const key = idempotencyGenerator.generateKey(deviceId, "transaction", entityId, clock);
    setIdempotencyKey(key);

    const hash = await idempotencyGenerator.calculateChecksum({
      amount: 1000,
      description: "Test",
    });
    setChecksum(hash);
  };

  return (
    <div className="container mx-auto max-w-2xl py-12 space-y-6">
      <h1 className="text-3xl font-bold">Idempotency Key Test</h1>

      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <label className="font-medium">Device ID:</label>
            <code className="block text-xs bg-gray-100 p-2 rounded mt-1">{deviceId}</code>
          </div>

          <div>
            <label className="font-medium">Entity ID:</label>
            <input
              type="text"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="block w-full border rounded px-3 py-2 mt-1"
            />
          </div>

          <Button onClick={generateKey}>Generate Key</Button>

          {idempotencyKey && (
            <>
              <div>
                <label className="font-medium">Lamport Clock:</label>
                <p className="text-2xl font-bold">{lamportClock}</p>
              </div>

              <div>
                <label className="font-medium">Idempotency Key:</label>
                <code className="block text-xs bg-gray-100 p-2 rounded mt-1 break-all">
                  {idempotencyKey}
                </code>
              </div>

              <div>
                <label className="font-medium">Checksum:</label>
                <code className="block text-xs bg-gray-100 p-2 rounded mt-1 break-all">
                  {checksum}
                </code>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-2">Test Instructions</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Click "Generate Key" - Should show lamport clock = 1</li>
          <li>Click again - Lamport clock should increment to 2</li>
          <li>Change entity ID - Lamport clock resets to 1 (independent)</li>
          <li>Key format should be: deviceId-transaction-entityId-clock</li>
        </ol>
      </Card>
    </div>
  );
}
```

**Visit**: http://localhost:3000/test-idempotency

---

## Done!

When all tests pass and keys generate correctly, you're ready for the checkpoint.

**Delete test route** after verification.

**Next**: Run through `checkpoint.md` to verify everything works.
