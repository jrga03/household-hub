# Instructions: Vector Clocks

Follow these steps in order. Estimated time: 2 hours.

---

## Step 1: Create Vector Clock Type Definitions (10 min)

Create or update `src/types/sync.ts`:

```typescript
/**
 * Per-entity vector clock for conflict detection
 * Maps device ID to logical clock value for that device
 */
export interface VectorClock {
  [deviceId: string]: number;
}

/**
 * Result of vector clock comparison
 */
export type ClockComparison = "concurrent" | "local-ahead" | "remote-ahead" | "equal";

/**
 * Lamport clock value (monotonic counter per entity)
 */
export type LamportClock = number;

/**
 * Per-entity clock state stored in meta table
 */
export interface EntityClockState {
  entityId: string;
  lamportClock: number;
  vectorClock: VectorClock;
  updatedAt: string;
}
```

**Verify**: No TypeScript errors

---

## Step 2: Create Vector Clock Utilities (30 min)

Create `src/lib/vector-clock.ts`:

```typescript
import type { VectorClock, ClockComparison } from "@/types/sync";

/**
 * Compare two vector clocks to determine causality
 *
 * @param v1 - Local vector clock
 * @param v2 - Remote vector clock
 * @returns Comparison result indicating relationship
 */
export function compareVectorClocks(v1: VectorClock, v2: VectorClock): ClockComparison {
  // Get all devices from both clocks
  const devices = new Set([...Object.keys(v1), ...Object.keys(v2)]);

  let v1Ahead = false;
  let v2Ahead = false;

  // Check each device's clock value
  for (const device of devices) {
    const t1 = v1[device] || 0;
    const t2 = v2[device] || 0;

    if (t1 > t2) {
      v1Ahead = true;
    }
    if (t2 > t1) {
      v2Ahead = true;
    }
  }

  // Interpret results
  if (v1Ahead && v2Ahead) {
    // Both clocks have events the other doesn't → concurrent edits
    return "concurrent";
  }
  if (v1Ahead) {
    // v1 has all of v2's events plus more → v1 ahead
    return "local-ahead";
  }
  if (v2Ahead) {
    // v2 has all of v1's events plus more → v2 ahead
    return "remote-ahead";
  }

  // All clock values equal → same version
  return "equal";
}

/**
 * Merge two vector clocks by taking element-wise maximum
 *
 * @param v1 - First vector clock
 * @param v2 - Second vector clock
 * @returns Merged vector clock with max values
 */
export function mergeVectorClocks(v1: VectorClock, v2: VectorClock): VectorClock {
  const merged: VectorClock = {};
  const devices = new Set([...Object.keys(v1), ...Object.keys(v2)]);

  for (const device of devices) {
    merged[device] = Math.max(v1[device] || 0, v2[device] || 0);
  }

  return merged;
}

/**
 * Increment vector clock for the current device
 *
 * @param clock - Current vector clock
 * @param deviceId - Device making the change
 * @returns Updated vector clock with incremented device value
 */
export function incrementVectorClock(clock: VectorClock, deviceId: string): VectorClock {
  return {
    ...clock,
    [deviceId]: (clock[deviceId] || 0) + 1,
  };
}

/**
 * Create a new vector clock for a device
 *
 * @param deviceId - Device ID
 * @returns New vector clock with device at 1
 */
export function createVectorClock(deviceId: string): VectorClock {
  return { [deviceId]: 1 };
}

/**
 * Check if a vector clock is empty
 *
 * @param clock - Vector clock to check
 * @returns True if clock has no entries
 */
export function isEmptyVectorClock(clock: VectorClock): boolean {
  return Object.keys(clock).length === 0;
}

/**
 * Serialize vector clock to JSON string for storage
 *
 * @param clock - Vector clock to serialize
 * @returns JSON string representation
 */
export function serializeVectorClock(clock: VectorClock): string {
  return JSON.stringify(clock);
}

/**
 * Deserialize vector clock from JSON string
 *
 * @param serialized - JSON string of vector clock
 * @returns Parsed vector clock object
 */
export function deserializeVectorClock(serialized: string): VectorClock {
  try {
    return JSON.parse(serialized) as VectorClock;
  } catch {
    return {};
  }
}

/**
 * Get maximum clock value across all devices
 *
 * @param clock - Vector clock
 * @returns Maximum clock value
 */
export function getMaxClockValue(clock: VectorClock): number {
  const values = Object.values(clock);
  return values.length > 0 ? Math.max(...values) : 0;
}
```

**Verify**: No TypeScript errors

---

## Step 3: Create Lamport Clock Manager (20 min)

Add to `src/lib/vector-clock.ts`:

```typescript
import { db } from "./dexie";

/**
 * Lamport clock manager for per-entity monotonic counters
 */
export class LamportClockManager {
  /**
   * Get current lamport clock for an entity
   *
   * @param entityId - Entity identifier
   * @returns Current lamport clock value
   */
  async getCurrentLamportClock(entityId: string): Promise<number> {
    // Check meta table for stored clock state
    const state = await db.meta.get(`clock:${entityId}`);
    return state?.value?.lamportClock || 0;
  }

  /**
   * Get next lamport clock value (increment and return)
   *
   * @param entityId - Entity identifier
   * @returns Next lamport clock value
   */
  async getNextLamportClock(entityId: string): Promise<number> {
    const current = await this.getCurrentLamportClock(entityId);
    const next = current + 1;

    // Store updated value
    await db.meta.put({
      key: `clock:${entityId}`,
      value: {
        lamportClock: next,
        updatedAt: new Date().toISOString(),
      },
    });

    return next;
  }

  /**
   * Get current vector clock for an entity
   *
   * @param entityId - Entity identifier
   * @returns Current vector clock
   */
  async getCurrentVectorClock(entityId: string): Promise<VectorClock> {
    const state = await db.meta.get(`clock:${entityId}`);
    return state?.value?.vectorClock || {};
  }

  /**
   * Update vector clock for an entity
   *
   * @param entityId - Entity identifier
   * @param deviceId - Device making the change
   * @returns Updated vector clock
   */
  async updateVectorClock(entityId: string, deviceId: string): Promise<VectorClock> {
    const current = await this.getCurrentVectorClock(entityId);
    const updated = incrementVectorClock(current, deviceId);

    // Store updated vector clock
    await db.meta.put({
      key: `clock:${entityId}`,
      value: {
        lamportClock: (current[deviceId] || 0) + 1,
        vectorClock: updated,
        updatedAt: new Date().toISOString(),
      },
    });

    return updated;
  }

  /**
   * Merge remote vector clock with local
   *
   * @param entityId - Entity identifier
   * @param remoteVectorClock - Vector clock from remote device
   */
  async mergeVectorClock(entityId: string, remoteVectorClock: VectorClock): Promise<void> {
    const localClock = await this.getCurrentVectorClock(entityId);
    const merged = mergeVectorClocks(localClock, remoteVectorClock);

    await db.meta.put({
      key: `clock:${entityId}`,
      value: {
        vectorClock: merged,
        updatedAt: new Date().toISOString(),
      },
    });
  }
}

// Singleton instance
export const lamportClockManager = new LamportClockManager();
```

**Verify**: Imports resolve, no TypeScript errors

---

## Step 4: Update Event Generation with Vector Clocks (20 min)

Update `src/lib/event-generator.ts` (or wherever you generate events):

```typescript
import { lamportClockManager, incrementVectorClock } from "./vector-clock";
import { deviceManager } from "./device-manager";

/**
 * Create event with vector clock and lamport clock
 */
export async function createEvent(params: {
  entityType: string;
  entityId: string;
  op: "create" | "update" | "delete";
  payload: any;
}): Promise<TransactionEvent> {
  const { entityType, entityId, op, payload } = params;

  // Get device ID
  const deviceId = await deviceManager.getDeviceId();

  // Get next lamport clock for this entity
  const lamportClock = await lamportClockManager.getNextLamportClock(entityId);

  // Update vector clock for this entity
  const vectorClock = await lamportClockManager.updateVectorClock(entityId, deviceId);

  // Generate idempotency key
  const idempotencyKey = `${deviceId}-${entityType}-${entityId}-${lamportClock}`;

  // Create event
  const event: TransactionEvent = {
    id: nanoid(),
    entityType,
    entityId,
    op,
    payload,
    timestamp: Date.now(),
    actorUserId: await getCurrentUserId(),
    deviceId,
    idempotencyKey,
    eventVersion: 1,
    lamportClock,
    vectorClock,
    checksum: await calculateChecksum(payload),
  };

  // Store in IndexedDB
  await db.events.add(event);

  // Queue for sync to Supabase
  await syncQueue.add({
    entityType,
    entityId,
    operation: op,
    payload: event,
    deviceId,
  });

  return event;
}
```

**Verify**: Event generation includes lamportClock and vectorClock

---

## Step 5: Create Comprehensive Unit Tests (30 min)

Create `src/lib/vector-clock.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  compareVectorClocks,
  mergeVectorClocks,
  incrementVectorClock,
  createVectorClock,
  isEmptyVectorClock,
  getMaxClockValue,
} from "./vector-clock";

describe("Vector Clock Comparison", () => {
  it("should detect equal clocks", () => {
    const v1 = { device1: 5, device2: 3 };
    const v2 = { device1: 5, device2: 3 };

    expect(compareVectorClocks(v1, v2)).toBe("equal");
  });

  it("should detect local ahead (causally ordered)", () => {
    const v1 = { device1: 5, device2: 3 };
    const v2 = { device1: 3, device2: 2 };

    expect(compareVectorClocks(v1, v2)).toBe("local-ahead");
  });

  it("should detect remote ahead (causally ordered)", () => {
    const v1 = { device1: 3, device2: 2 };
    const v2 = { device1: 5, device2: 3 };

    expect(compareVectorClocks(v1, v2)).toBe("remote-ahead");
  });

  it("should detect concurrent edits (conflict)", () => {
    const v1 = { device1: 5, device2: 2 };
    const v2 = { device1: 3, device2: 4 };

    expect(compareVectorClocks(v1, v2)).toBe("concurrent");
  });

  it("should handle missing devices in clock", () => {
    const v1 = { device1: 5 };
    const v2 = { device1: 3, device2: 2 };

    expect(compareVectorClocks(v1, v2)).toBe("local-ahead");
  });

  it("should handle empty clocks", () => {
    const v1 = {};
    const v2 = {};

    expect(compareVectorClocks(v1, v2)).toBe("equal");
  });
});

describe("Vector Clock Merging", () => {
  it("should take element-wise maximum", () => {
    const v1 = { device1: 5, device2: 3 };
    const v2 = { device1: 3, device2: 7 };

    const merged = mergeVectorClocks(v1, v2);

    expect(merged).toEqual({ device1: 5, device2: 7 });
  });

  it("should include devices from both clocks", () => {
    const v1 = { device1: 5 };
    const v2 = { device2: 3 };

    const merged = mergeVectorClocks(v1, v2);

    expect(merged).toEqual({ device1: 5, device2: 3 });
  });

  it("should be commutative", () => {
    const v1 = { device1: 5, device2: 3 };
    const v2 = { device1: 3, device2: 7 };

    const merge1 = mergeVectorClocks(v1, v2);
    const merge2 = mergeVectorClocks(v2, v1);

    expect(merge1).toEqual(merge2);
  });

  it("should be idempotent", () => {
    const v1 = { device1: 5, device2: 3 };

    const merged = mergeVectorClocks(v1, v1);

    expect(merged).toEqual(v1);
  });
});

describe("Vector Clock Operations", () => {
  it("should increment clock for device", () => {
    const clock = { device1: 5, device2: 3 };
    const updated = incrementVectorClock(clock, "device1");

    expect(updated).toEqual({ device1: 6, device2: 3 });
  });

  it("should initialize device clock if not present", () => {
    const clock = { device1: 5 };
    const updated = incrementVectorClock(clock, "device2");

    expect(updated).toEqual({ device1: 5, device2: 1 });
  });

  it("should create new clock for device", () => {
    const clock = createVectorClock("device1");

    expect(clock).toEqual({ device1: 1 });
  });

  it("should detect empty clock", () => {
    expect(isEmptyVectorClock({})).toBe(true);
    expect(isEmptyVectorClock({ device1: 1 })).toBe(false);
  });

  it("should get max clock value", () => {
    const clock = { device1: 5, device2: 3, device3: 8 };

    expect(getMaxClockValue(clock)).toBe(8);
  });

  it("should return 0 for empty clock", () => {
    expect(getMaxClockValue({})).toBe(0);
  });
});

describe("Vector Clock Properties", () => {
  it("comparison should be reflexive", () => {
    const clock = { device1: 5, device2: 3 };

    expect(compareVectorClocks(clock, clock)).toBe("equal");
  });

  it("comparison should be consistent", () => {
    const v1 = { device1: 5, device2: 2 };
    const v2 = { device1: 3, device2: 4 };

    const result1 = compareVectorClocks(v1, v2);
    const result2 = compareVectorClocks(v2, v1);

    // Both should be "concurrent" or opposite ahead results
    expect(result1).toBe("concurrent");
    expect(result2).toBe("concurrent");
  });

  it("merge should preserve causality", () => {
    const v1 = { device1: 5, device2: 3 };
    const v2 = { device1: 3, device2: 7 };
    const merged = mergeVectorClocks(v1, v2);

    // Merged should be ahead of both inputs
    expect(compareVectorClocks(merged, v1)).toBe("local-ahead");
    expect(compareVectorClocks(merged, v2)).toBe("local-ahead");
  });
});
```

**Run tests**:

```bash
npm test src/lib/vector-clock.test.ts
```

All tests should pass.

---

## Step 6: Update Dexie Schema (If Needed) (10 min)

Ensure `src/lib/dexie.ts` includes vector clock support:

```typescript
export interface TransactionEvent {
  id: string;
  entityType: string;
  entityId: string;
  op: "create" | "update" | "delete";
  payload: any;
  timestamp: number;
  actorUserId: string;
  deviceId: string;
  idempotencyKey: string;
  eventVersion: number;

  // Vector clock fields
  lamportClock: number;
  vectorClock: VectorClock;

  checksum: string;
}

// ... in HouseholdHubDB class:

this.version(N).stores({
  events: "id, entity_id, lamport_clock, timestamp, device_id",
  meta: "key", // Stores per-entity clock state
});
```

**Verify**: No schema conflicts

---

## Step 7: Test Vector Clock Integration (20 min)

Create integration test `tests/integration/vector-clock-integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createEvent } from "@/lib/event-generator";
import { compareVectorClocks } from "@/lib/vector-clock";
import { db } from "@/lib/dexie";

describe("Vector Clock Integration", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.close();
  });

  it("should include vector clock in generated event", async () => {
    const event = await createEvent({
      entityType: "transaction",
      entityId: "tx-123",
      op: "create",
      payload: { amount: 1000 },
    });

    expect(event.lamportClock).toBe(1);
    expect(event.vectorClock).toBeDefined();
    expect(Object.keys(event.vectorClock).length).toBeGreaterThan(0);
  });

  it("should increment lamport clock for same entity", async () => {
    const event1 = await createEvent({
      entityType: "transaction",
      entityId: "tx-123",
      op: "create",
      payload: { amount: 1000 },
    });

    const event2 = await createEvent({
      entityType: "transaction",
      entityId: "tx-123",
      op: "update",
      payload: { amount: 2000 },
    });

    expect(event1.lamportClock).toBe(1);
    expect(event2.lamportClock).toBe(2);
  });

  it("should have independent clocks per entity", async () => {
    const eventA = await createEvent({
      entityType: "transaction",
      entityId: "tx-A",
      op: "create",
      payload: {},
    });

    const eventB = await createEvent({
      entityType: "transaction",
      entityId: "tx-B",
      op: "create",
      payload: {},
    });

    // Both should start at lamport clock 1
    expect(eventA.lamportClock).toBe(1);
    expect(eventB.lamportClock).toBe(1);
  });

  it("should detect sequential edits (no conflict)", async () => {
    // Simulate Device A edits
    const event1 = await createEvent({
      entityType: "transaction",
      entityId: "tx-123",
      op: "create",
      payload: { amount: 1000 },
    });

    // Simulate Device A edits again (sequential)
    const event2 = await createEvent({
      entityType: "transaction",
      entityId: "tx-123",
      op: "update",
      payload: { amount: 2000 },
    });

    // Compare clocks
    const comparison = compareVectorClocks(event2.vectorClock, event1.vectorClock);

    // Event2 should be ahead (no conflict)
    expect(comparison).toBe("local-ahead");
  });
});
```

**Run test**:

```bash
npm test tests/integration/vector-clock-integration.test.ts
```

---

## Step 8: Add Vector Clock Debugging Utility (10 min)

Create `src/lib/vector-clock-debug.ts`:

```typescript
import type { VectorClock } from "@/types/sync";
import { compareVectorClocks, getMaxClockValue } from "./vector-clock";

/**
 * Format vector clock for human-readable display
 */
export function formatVectorClock(clock: VectorClock): string {
  const entries = Object.entries(clock)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([device, value]) => `${device.substring(0, 8)}:${value}`)
    .join(", ");

  return `{${entries}}`;
}

/**
 * Log vector clock comparison for debugging
 */
export function logVectorClockComparison(
  label: string,
  local: VectorClock,
  remote: VectorClock
): void {
  const comparison = compareVectorClocks(local, remote);

  console.log(`[Vector Clock] ${label}`);
  console.log(`  Local:  ${formatVectorClock(local)}`);
  console.log(`  Remote: ${formatVectorClock(remote)}`);
  console.log(`  Result: ${comparison}`);
}

/**
 * Get vector clock summary statistics
 */
export function getVectorClockStats(clock: VectorClock): {
  deviceCount: number;
  maxValue: number;
  totalEvents: number;
} {
  const values = Object.values(clock);

  return {
    deviceCount: Object.keys(clock).length,
    maxValue: getMaxClockValue(clock),
    totalEvents: values.reduce((sum, val) => sum + val, 0),
  };
}
```

---

## Done!

When all tests pass and vector clocks are integrated into event generation, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Per-Entity Clocks**:

- Each entity (transaction, account, category) maintains its own independent vector clock
- Reduces contention and simplifies reasoning
- Lamport clock provides total ordering within an entity

**Causality Detection**:

- Vector clocks capture "happened-before" relationships
- Concurrent = potential conflict (needs resolution)
- Ahead = no conflict (causally ordered)

**Performance**:

- Clock comparison is O(D) where D = device count (typically 2-5)
- Clock storage is ~50 bytes per entity
- Negligible overhead for typical usage

**Debugging**:

- Use `formatVectorClock()` for readable clock display
- Use `logVectorClockComparison()` to debug sync issues
- Check Dexie meta table for per-entity clock state
