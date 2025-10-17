# Instructions: Offline Writes Queue

Follow these steps in order. Estimated time: 2.5 hours.

---

## Step 0: Create Type Definitions (10 min)

Create `src/types/sync.ts`:

```typescript
/**
 * Entity types that can be synced
 */
export type EntityType = "transaction" | "account" | "category" | "budget";

/**
 * Sync queue operation structure
 */
export interface SyncQueueOperation {
  op: "create" | "update" | "delete";
  payload: any;
  idempotencyKey: string;
  lamportClock: number;
  vectorClock: Record<string, number>;
}
```

---

## Step 1: Create Idempotency Key Generator (15 min)

Create `src/lib/sync/idempotency.ts`:

```typescript
import { deviceManager } from "@/lib/dexie/deviceManager";

/**
 * Generate deterministic idempotency key
 * Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
 */
export async function generateIdempotencyKey(
  entityType: string,
  entityId: string,
  lamportClock: number
): Promise<string> {
  const deviceId = await deviceManager.getDeviceId();
  return `${deviceId}-${entityType}-${entityId}-${lamportClock}`;
}

/**
 * Parse idempotency key into components
 * Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
 * Note: entityId may contain hyphens (e.g., "temp-abc-123")
 */
export function parseIdempotencyKey(key: string): {
  deviceId: string;
  entityType: string;
  entityId: string;
  lamportClock: number;
} | null {
  const parts = key.split("-");
  if (parts.length < 4) return null;

  // Parse from the end since lamport clock is always last
  const lamportClock = parseInt(parts[parts.length - 1], 10);
  if (isNaN(lamportClock)) return null;

  const deviceId = parts[0];
  const entityType = parts[1];
  // Rejoin middle parts to handle hyphens in entity IDs
  const entityId = parts.slice(2, -1).join("-");

  return {
    deviceId,
    entityType,
    entityId,
    lamportClock,
  };
}
```

---

## Step 2: Create Lamport Clock Manager (20 min)

Create `src/lib/sync/lamportClock.ts`:

```typescript
import { db } from "@/lib/dexie/db";

/**
 * Get next Lamport clock value for an entity
 * Clocks are per-entity, not global
 */
export async function getNextLamportClock(entityId: string): Promise<number> {
  const key = `lamport-${entityId}`;

  // Get current value
  const current = await db.meta.get(key);
  const currentValue = current?.value || 0;

  // Increment
  const nextValue = currentValue + 1;

  // Store new value
  await db.meta.put({ key, value: nextValue });

  return nextValue;
}

/**
 * Get current Lamport clock value (without incrementing)
 */
export async function getCurrentLamportClock(entityId: string): Promise<number> {
  const key = `lamport-${entityId}`;
  const current = await db.meta.get(key);
  return current?.value || 0;
}

/**
 * Reset Lamport clock for an entity (use cautiously)
 */
export async function resetLamportClock(entityId: string): Promise<void> {
  const key = `lamport-${entityId}`;
  await db.meta.put({ key, value: 0 });
}

/**
 * Merge remote Lamport clock value (for conflict resolution)
 * Take max of local and remote
 */
export async function mergeLamportClock(entityId: string, remoteClock: number): Promise<void> {
  const key = `lamport-${entityId}`;
  const current = await db.meta.get(key);
  const currentValue = current?.value || 0;

  // Take max to maintain causality
  const merged = Math.max(currentValue, remoteClock);

  await db.meta.put({ key, value: merged });
}
```

---

## Step 3: Create Vector Clock Manager (25 min)

Create `src/lib/sync/vectorClock.ts`:

```typescript
import { db } from "@/lib/dexie/db";
import { deviceManager } from "@/lib/dexie/deviceManager";

export type VectorClock = Record<string, number>;

/**
 * Get current vector clock for entity
 */
export async function getVectorClock(entityId: string): Promise<VectorClock> {
  const key = `vectorClock-${entityId}`;
  const stored = await db.meta.get(key);
  return stored?.value || {};
}

/**
 * Store vector clock
 */
async function storeVectorClock(entityId: string, clock: VectorClock): Promise<void> {
  const key = `vectorClock-${entityId}`;
  await db.meta.put({ key, value: clock });
}

/**
 * Increment vector clock for current device
 */
export async function incrementVectorClock(entityId: string): Promise<VectorClock> {
  const deviceId = await deviceManager.getDeviceId();
  const clock = await getVectorClock(entityId);

  // Increment our device's clock
  clock[deviceId] = (clock[deviceId] || 0) + 1;

  await storeVectorClock(entityId, clock);
  return clock;
}

/**
 * Merge vector clocks (take max of each device)
 */
export function mergeVectorClocks(v1: VectorClock, v2: VectorClock): VectorClock {
  const merged: VectorClock = { ...v1 };

  for (const [device, clock] of Object.entries(v2)) {
    merged[device] = Math.max(merged[device] || 0, clock);
  }

  return merged;
}

/**
 * Compare vector clocks for conflict detection
 */
export function compareVectorClocks(
  v1: VectorClock,
  v2: VectorClock
): "concurrent" | "v1-ahead" | "v2-ahead" | "equal" {
  const devices = new Set([...Object.keys(v1), ...Object.keys(v2)]);

  let v1Ahead = false;
  let v2Ahead = false;

  for (const device of devices) {
    const c1 = v1[device] || 0;
    const c2 = v2[device] || 0;

    if (c1 > c2) v1Ahead = true;
    if (c2 > c1) v2Ahead = true;
  }

  if (v1Ahead && v2Ahead) return "concurrent";
  if (v1Ahead) return "v1-ahead";
  if (v2Ahead) return "v2-ahead";
  return "equal";
}
```

---

## Step 4: Create Sync Queue Operations (30 min)

Create `src/lib/offline/syncQueue.ts`:

```typescript
import { supabase } from "@/lib/supabase";
import { deviceManager } from "@/lib/dexie/deviceManager";
import { generateIdempotencyKey } from "@/lib/sync/idempotency";
import { getNextLamportClock } from "@/lib/sync/lamportClock";
import { incrementVectorClock } from "@/lib/sync/vectorClock";
import type { EntityType, SyncQueueOperation } from "@/types/sync";

/**
 * Add item to sync queue
 */
export async function addToSyncQueue(
  entityType: EntityType,
  entityId: string,
  op: "create" | "update" | "delete",
  payload: any,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const deviceId = await deviceManager.getDeviceId();

    // Get next Lamport clock for this entity
    const lamportClock = await getNextLamportClock(entityId);

    // Increment vector clock for this entity
    const vectorClock = await incrementVectorClock(entityId);

    // Generate idempotency key
    const idempotencyKey = await generateIdempotencyKey(entityType, entityId, lamportClock);

    // Create operation object
    const operation: SyncQueueOperation = {
      op,
      payload,
      idempotencyKey,
      lamportClock,
      vectorClock,
    };

    // Insert into sync_queue table
    const { error } = await supabase.from("sync_queue").insert({
      entity_type: entityType,
      entity_id: entityId,
      operation,
      device_id: deviceId,
      user_id: userId,
      status: "queued",
    });

    if (error) {
      console.error("Failed to add to sync queue:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error adding to sync queue:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get pending queue items for current device
 */
export async function getPendingQueueItems(userId: string) {
  const deviceId = await deviceManager.getDeviceId();

  const { data, error } = await supabase
    .from("sync_queue")
    .select("*")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .in("status", ["queued", "failed"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to get pending queue items:", error);
    return [];
  }

  return data || [];
}

/**
 * Get queue count for sync status UI
 */
export async function getQueueCount(userId: string): Promise<number> {
  const deviceId = await deviceManager.getDeviceId();

  const { count, error } = await supabase
    .from("sync_queue")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .in("status", ["queued", "failed"]);

  if (error) {
    console.error("Failed to get queue count:", error);
    return 0;
  }

  return count || 0;
}
```

---

## Step 5: Modify Transaction Mutations (20 min)

Update `src/lib/offline/transactions.ts` to add to queue:

```typescript
import { addToSyncQueue } from "./syncQueue";

export async function createOfflineTransaction(
  input: TransactionInput,
  userId: string
): Promise<OfflineOperationResult<Transaction>> {
  try {
    // ... existing code to create transaction ...

    // Write to IndexedDB
    await db.transactions.add(transaction);

    // Add to sync queue
    const queueResult = await addToSyncQueue(
      "transaction",
      transaction.id,
      "create",
      transaction,
      userId
    );

    if (!queueResult.success) {
      // Rollback IndexedDB write
      await db.transactions.delete(transaction.id);
      return {
        success: false,
        error: `Failed to queue for sync: ${queueResult.error}`,
        isTemporary: false,
      };
    }

    return {
      success: true,
      data: transaction,
      isTemporary: true,
    };
  } catch (error) {
    // ... existing error handling ...
  }
}

// Similar updates for updateOfflineTransaction and deleteOfflineTransaction
```

---

## Step 5b: Modify Account Mutations (10 min)

Update `src/lib/offline/accounts.ts` to add to queue:

```typescript
import { addToSyncQueue } from "./syncQueue";

export async function createOfflineAccount(
  input: AccountInput,
  userId: string
): Promise<OfflineOperationResult<Account>> {
  try {
    // ... existing code to create account ...

    // Write to IndexedDB
    await db.accounts.add(account);

    // Add to sync queue
    const queueResult = await addToSyncQueue("account", account.id, "create", account, userId);

    if (!queueResult.success) {
      // Rollback IndexedDB write
      await db.accounts.delete(account.id);
      return {
        success: false,
        error: `Failed to queue for sync: ${queueResult.error}`,
        isTemporary: false,
      };
    }

    return {
      success: true,
      data: account,
      isTemporary: true,
    };
  } catch (error) {
    // ... existing error handling ...
  }
}

// Similar updates for updateOfflineAccount and deleteOfflineAccount
```

---

## Step 5c: Modify Category Mutations (10 min)

Update `src/lib/offline/categories.ts` to add to queue:

```typescript
import { addToSyncQueue } from "./syncQueue";

export async function createOfflineCategory(
  input: CategoryInput,
  userId: string
): Promise<OfflineOperationResult<Category>> {
  try {
    // ... existing code to create category ...

    // Write to IndexedDB
    await db.categories.add(category);

    // Add to sync queue
    const queueResult = await addToSyncQueue("category", category.id, "create", category, userId);

    if (!queueResult.success) {
      // Rollback IndexedDB write
      await db.categories.delete(category.id);
      return {
        success: false,
        error: `Failed to queue for sync: ${queueResult.error}`,
        isTemporary: false,
      };
    }

    return {
      success: true,
      data: category,
      isTemporary: true,
    };
  } catch (error) {
    // ... existing error handling ...
  }
}

// Similar updates for updateOfflineCategory
```

---

## Step 6: Test Queue Integration (20 min)

Create `src/lib/offline/syncQueue.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { supabase } from "@/lib/supabase";
import { createOfflineTransaction } from "./transactions";
import { createOfflineAccount } from "./accounts";
import { createOfflineCategory } from "./categories";
import { getQueueCount } from "./syncQueue";

describe("Sync Queue Integration", () => {
  const testUserId = "test-user-123";

  beforeEach(async () => {
    await db.transactions.clear();
    await db.meta.clear();
    // Clear sync_queue via Supabase
  });

  it("should add transaction to queue on create", async () => {
    const input = {
      date: "2024-01-15",
      description: "Test with queue",
      amount_cents: 100000,
      type: "expense" as const,
      status: "pending" as const,
      visibility: "household" as const,
    };

    const result = await createOfflineTransaction(input, testUserId);

    expect(result.success).toBe(true);

    // Check IndexedDB
    const stored = await db.transactions.get(result.data!.id);
    expect(stored).toBeDefined();

    // Check sync queue
    const queueCount = await getQueueCount(testUserId);
    expect(queueCount).toBe(1);
  });

  it("should generate idempotency key", async () => {
    const input = {
      date: "2024-01-15",
      description: "Test idempotency",
      amount_cents: 100000,
      type: "expense" as const,
      status: "pending" as const,
      visibility: "household" as const,
    };

    const result = await createOfflineTransaction(input, testUserId);

    // Get queue item
    const { data } = await supabase
      .from("sync_queue")
      .select("operation")
      .eq("entity_id", result.data!.id)
      .single();

    expect(data?.operation.idempotencyKey).toBeDefined();
    expect(data?.operation.idempotencyKey).toMatch(/^device-/);
  });

  it("should increment Lamport clock", async () => {
    // Create first transaction
    const result1 = await createOfflineTransaction({...}, testUserId);

    const { data: queue1 } = await supabase
      .from("sync_queue")
      .select("operation")
      .eq("entity_id", result1.data!.id)
      .single();

    expect(queue1?.operation.lamportClock).toBe(1);

    // Create second transaction
    const result2 = await createOfflineTransaction({...}, testUserId);

    const { data: queue2 } = await supabase
      .from("sync_queue")
      .select("operation")
      .eq("entity_id", result2.data!.id)
      .single();

    expect(queue2?.operation.lamportClock).toBe(1); // Different entity
  });
});
```

**Run tests**:

```bash
npm test src/lib/offline/syncQueue.test.ts
```

---

## Step 7: Update Hooks to Handle Queue Failures (10 min)

Update `src/hooks/useOfflineTransaction.ts`:

```typescript
export function useCreateOfflineTransaction() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: (input: TransactionInput) => {
      if (!user?.id) throw new Error("User not authenticated");
      return createOfflineTransaction(input, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
        toast.success("Transaction created and queued for sync");
      } else {
        // Queue failed - transaction was rolled back
        toast.error(result.error || "Failed to create transaction");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}
```

---

## Done!

When tests pass and queue integration works, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Atomicity Pattern**:

- Write to IndexedDB first
- Then add to sync queue
- Rollback IndexedDB if queue fails
- Prevents orphaned offline data

**Idempotency Keys**:

- Deterministic format
- Include Lamport clock for uniqueness
- Server uses for deduplication

**Lamport Clocks**:

- Per-entity counters
- Stored in IndexedDB meta table
- Used for ordering and conflict detection

**Vector Clocks**:

- Initialized now for Phase B
- Track per-device causality
- Enable concurrent edit detection
