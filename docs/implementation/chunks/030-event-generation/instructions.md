# Instructions: Event Generation

Follow these steps in order. Estimated time: 1.5 hours.

---

## Step 1: Create Event Generator Utility (30 min)

Create `src/lib/event-generator.ts`:

```typescript
import { nanoid } from "nanoid";
import { db } from "./dexie";
import { supabase } from "./supabase";
import { deviceManager } from "./device-manager";
import { idempotencyGenerator } from "./idempotency";
import type { EntityType, EventOp, TransactionEvent } from "@/types/event";

/**
 * EventGenerator creates events for all mutations
 */
export class EventGenerator {
  /**
   * Create event for entity mutation
   *
   * @param params Event parameters
   * @returns Created event
   */
  async createEvent(params: {
    entityType: EntityType;
    entityId: string;
    op: EventOp;
    payload: any;
    userId: string;
  }): Promise<TransactionEvent> {
    const { entityType, entityId, op, payload, userId } = params;

    // Get device ID
    const deviceId = await deviceManager.getDeviceId();

    // Get next lamport clock for this entity
    const lamportClock = await idempotencyGenerator.getNextLamportClock(entityId);

    // Generate idempotency key
    const idempotencyKey = idempotencyGenerator.generateKey(
      deviceId,
      entityType,
      entityId,
      lamportClock
    );

    // Calculate checksum
    const checksum = await idempotencyGenerator.calculateChecksum(payload);

    // Get or initialize vector clock
    const vectorClock = await this.getVectorClock(entityId, deviceId);

    // Create event object
    const event: TransactionEvent = {
      id: nanoid(),
      entityType,
      entityId,
      op,
      payload,
      timestamp: Date.now(),
      actorUserId: userId,
      deviceId,
      idempotencyKey,
      eventVersion: 1,
      lamportClock,
      vectorClock,
      checksum,
    };

    // Store in Dexie (offline-first)
    await db.events.add(event);

    // Store in Supabase (cloud sync)
    try {
      await supabase.from("transaction_events").insert({
        id: event.id,
        entity_type: event.entityType,
        entity_id: event.entityId,
        op: event.op,
        payload: event.payload,
        timestamp: new Date(event.timestamp).toISOString(),
        actor_user_id: event.actorUserId,
        device_id: event.deviceId,
        idempotency_key: event.idempotencyKey,
        event_version: event.eventVersion,
        lamport_clock: event.lamportClock,
        vector_clock: event.vectorClock,
        checksum: event.checksum,
      });
    } catch (error) {
      console.warn("Failed to store event in Supabase, will sync later:", error);
      // Event is in Dexie, sync queue will retry
    }

    return event;
  }

  /**
   * Get current vector clock for entity
   */
  private async getVectorClock(entityId: string, deviceId: string): Promise<any> {
    // Query latest event for this entity
    const events = await db.events.where("entityId").equals(entityId).reverse().limit(1).toArray();

    if (events.length === 0) {
      // First event for this entity
      return idempotencyGenerator.initVectorClock(deviceId);
    }

    // Update existing vector clock
    return idempotencyGenerator.updateVectorClock(events[0].vectorClock, deviceId);
  }

  /**
   * Calculate delta payload (only changed fields)
   */
  calculateDelta(oldValue: any, newValue: any): any {
    const delta: any = {};

    for (const key in newValue) {
      if (newValue[key] !== oldValue[key]) {
        delta[key] = newValue[key];
      }
    }

    return delta;
  }
}

// Singleton instance
export const eventGenerator = new EventGenerator();

/**
 * Helper: Create event for transaction
 */
export async function createTransactionEvent(
  op: EventOp,
  transactionId: string,
  payload: any,
  userId: string
): Promise<TransactionEvent> {
  return eventGenerator.createEvent({
    entityType: "transaction",
    entityId: transactionId,
    op,
    payload,
    userId,
  });
}

/**
 * Helper: Create event for account
 */
export async function createAccountEvent(
  op: EventOp,
  accountId: string,
  payload: any,
  userId: string
): Promise<TransactionEvent> {
  return eventGenerator.createEvent({
    entityType: "account",
    entityId: accountId,
    op,
    payload,
    userId,
  });
}

/**
 * Helper: Create event for category
 */
export async function createCategoryEvent(
  op: EventOp,
  categoryId: string,
  payload: any,
  userId: string
): Promise<TransactionEvent> {
  return eventGenerator.createEvent({
    entityType: "category",
    entityId: categoryId,
    op,
    payload,
    userId,
  });
}

/**
 * Helper: Create event for budget
 */
export async function createBudgetEvent(
  op: EventOp,
  budgetId: string,
  payload: any,
  userId: string
): Promise<TransactionEvent> {
  return eventGenerator.createEvent({
    entityType: "budget",
    entityId: budgetId,
    op,
    payload,
    userId,
  });
}
```

---

## Step 2: Hook into Transaction Mutations (20 min)

Update your transaction creation function (e.g., `src/lib/transactions.ts`):

```typescript
import { createTransactionEvent } from "./event-generator";
import { useAuthStore } from "@/stores/authStore";

export async function createTransaction(data: TransactionInput): Promise<Transaction> {
  // Get current user
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error("Not authenticated");

  // 1. Create transaction
  const transaction = await db.transactions.add({
    ...data,
    id: nanoid(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // 2. Generate event
  await createTransactionEvent("create", transaction.id, transaction, userId);

  return transaction;
}

export async function updateTransaction(
  id: string,
  changes: Partial<Transaction>
): Promise<Transaction> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error("Not authenticated");

  // 1. Get old value
  const oldTransaction = await db.transactions.get(id);
  if (!oldTransaction) throw new Error("Transaction not found");

  // 2. Update transaction
  await db.transactions.update(id, {
    ...changes,
    updated_at: new Date().toISOString(),
  });

  // 3. Get new value
  const newTransaction = await db.transactions.get(id);

  // 4. Calculate delta (only changed fields)
  const delta = eventGenerator.calculateDelta(oldTransaction, changes);

  // 5. Generate event
  await createTransactionEvent("update", id, delta, userId);

  return newTransaction!;
}

export async function deleteTransaction(id: string): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error("Not authenticated");

  // 1. Delete transaction
  await db.transactions.delete(id);

  // 2. Generate event
  await createTransactionEvent("delete", id, { deleted: true }, userId);
}
```

---

## Step 3: Create Unit Tests (20 min)

Create `src/lib/event-generator.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eventGenerator } from "./event-generator";
import { db } from "./dexie";

describe("EventGenerator", () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  afterEach(async () => {
    await db.events.clear();
  });

  it("should create event", async () => {
    const event = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-test",
      op: "create",
      payload: { amount: 1000 },
      userId: "user-123",
    });

    expect(event.entityType).toBe("transaction");
    expect(event.entityId).toBe("tx-test");
    expect(event.op).toBe("create");
    expect(event.lamportClock).toBe(1);
  });

  it("should store event in Dexie", async () => {
    await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-test",
      op: "create",
      payload: { amount: 1000 },
      userId: "user-123",
    });

    const events = await db.events.where("entityId").equals("tx-test").toArray();
    expect(events).toHaveLength(1);
  });

  it("should increment lamport clock", async () => {
    const event1 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-test",
      op: "create",
      payload: {},
      userId: "user-123",
    });

    const event2 = await eventGenerator.createEvent({
      entityType: "transaction",
      entityId: "tx-test",
      op: "update",
      payload: {},
      userId: "user-123",
    });

    expect(event1.lamportClock).toBe(1);
    expect(event2.lamportClock).toBe(2);
  });

  it("should calculate delta", () => {
    const oldValue = { amount: 1000, description: "Old", status: "pending" };
    const newValue = { amount: 2000, description: "Old" }; // amount changed

    const delta = eventGenerator.calculateDelta(oldValue, newValue);

    expect(delta).toEqual({ amount: 2000 });
  });
});
```

---

## Step 4: Test Event Generation (10 min)

```javascript
// In browser console
const userId = (await supabase.auth.getUser()).data.user.id;

// Create transaction
await createTransaction({
  amount_cents: 100000,
  description: "Test transaction",
  type: "expense",
  account_id: "...",
});

// Check Dexie events
const events = await db.events.toArray();
console.log("Events in Dexie:", events);

// Check Supabase events
const { data } = await supabase.from("transaction_events").select("*");
console.log("Events in Supabase:", data);
```

---

## Step 5: Verify in Supabase Dashboard (10 min)

1. Go to Supabase Dashboard → Table Editor → transaction_events
2. Find recent event
3. Verify:
   - entity_type = "transaction"
   - op = "create" or "update" or "delete"
   - payload contains data
   - idempotency_key format correct
   - lamport_clock increments

---

## Done!

When events generate on all mutations, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.
