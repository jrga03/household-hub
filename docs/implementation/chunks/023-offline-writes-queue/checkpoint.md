# Checkpoint: Offline Writes Queue

Run these verifications to ensure offline writes integrate with sync queue.

---

## 1. Unit Tests Pass ✓

```bash
npm test src/lib/offline/syncQueue.test.ts
npm test src/lib/sync/
```

**Expected**: All tests pass, queue items created correctly

---

## 2. Create Transaction Adds to Queue ✓

**Test Case 1: Manual creation**

1. Go offline (DevTools → Network → Offline)
2. Create transaction via UI
3. Check IndexedDB (has transaction)
4. Go online
5. Check Supabase sync_queue table

**SQL verification**:

```sql
SELECT
  entity_type,
  entity_id,
  operation->>'op' AS operation,
  operation->>'idempotencyKey' AS idempotency_key,
  status,
  created_at
FROM sync_queue
ORDER BY created_at DESC
LIMIT 5;
```

**Expected**: One queued item with:

- entity_type = 'transaction'
- operation = 'create'
- status = 'queued'
- idempotency_key matches pattern `device-*`

---

## 3. Idempotency Keys Generated Correctly ✓

**Test**:

```typescript
// In browser console
import { generateIdempotencyKey } from "@/lib/sync/idempotency";

const key1 = await generateIdempotencyKey("transaction", "tx-1", 5);
console.log(key1); // "device-xxx-transaction-tx-1-5"

const key2 = await generateIdempotencyKey("transaction", "tx-1", 6);
console.log(key2); // "device-xxx-transaction-tx-1-6"
```

**Expected**:

- Format: `{deviceId}-{entityType}-{entityId}-{clock}`
- Same entity, different clock → different key
- Deterministic (same inputs = same output)

---

## 4. Lamport Clocks Increment Per Entity ✓

**Test**:

```typescript
// Create two transactions
const tx1 = await createOfflineTransaction({...}, userId);
const tx2 = await createOfflineTransaction({...}, userId);

// Check their clocks
const queue1 = await supabase
  .from("sync_queue")
  .select("operation")
  .eq("entity_id", tx1.data.id)
  .single();

const queue2 = await supabase
  .from("sync_queue")
  .select("operation")
  .eq("entity_id", tx2.data.id)
  .single();

console.log(queue1.data.operation.lamportClock); // 1
console.log(queue2.data.operation.lamportClock); // 1 (different entities)
```

**Expected**: Each entity starts at clock 1

---

## 5. Vector Clocks Initialized ✓

**Test**:

```typescript
const result = await createOfflineTransaction({...}, userId);

const { data } = await supabase
  .from("sync_queue")
  .select("operation")
  .eq("entity_id", result.data.id)
  .single();

console.log(data.operation.vectorClock);
// { "device-xyz": 1 }
```

**Expected**: Vector clock has device ID with value 1

---

## 6. Rollback Works on Queue Failure ✓

**Test**: Simulate queue failure using Vitest mocking

```typescript
import { vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { createOfflineTransaction } from "@/lib/offline/transactions";
import { db } from "@/lib/dexie/db";

// Mock Supabase insert to fail
const insertSpy = vi.spyOn(supabase.from("sync_queue"), "insert");
insertSpy.mockResolvedValueOnce({
  data: null,
  error: { message: "Simulated failure", code: "MOCK_ERROR" } as any,
});

const result = await createOfflineTransaction(
  {
    date: "2024-01-15",
    description: "Test rollback",
    amount_cents: 100000,
    type: "expense",
    status: "pending",
    visibility: "household",
  },
  userId
);

console.log(result.success); // false
console.log(result.error); // "Failed to queue for sync: Simulated failure"

// Check IndexedDB - should NOT have transaction
const stored = await db.transactions.get(result.data?.id);
console.log(stored); // undefined (rolled back)

// Restore mock
insertSpy.mockRestore();
```

**Expected**:

- `result.success` is `false`
- Transaction NOT in IndexedDB (rolled back)
- Error message indicates queue failure

---

## 7. Queue Count Correct ✓

**Test**:

```typescript
// Create 3 transactions
await createOfflineTransaction({...}, userId);
await createOfflineTransaction({...}, userId);
await createOfflineTransaction({...}, userId);

// Check count
const count = await getQueueCount(userId);
console.log(count); // 3
```

**Expected**: Count matches number of queued items

---

## 8. Update and Delete Also Queue ✓

**Test Case 2: Update transaction**

1. Create transaction
2. Update it
3. Check sync_queue has 2 items (create + update)

**Test Case 3: Delete transaction**

1. Create transaction
2. Delete it
3. Check sync_queue has 2 items (create + delete)

**SQL verification**:

```sql
SELECT
  entity_id,
  operation->>'op' AS operation,
  status
FROM sync_queue
WHERE entity_id = 'temp-[ID]'
ORDER BY created_at ASC;
```

**Expected**:

- create (queued)
- update (queued)
- delete (queued)

---

## 9. Account and Category Mutations Queue ✓

**Test Case 1: Create account**

```typescript
import { createOfflineAccount } from "@/lib/offline/accounts";
import { getQueueCount } from "@/lib/offline/syncQueue";

const accountInput = {
  name: "Test Checking",
  type: "checking" as const,
  visibility: "household" as const,
  initial_balance_cents: 0,
};

const result = await createOfflineAccount(accountInput, userId);

expect(result.success).toBe(true);

// Check IndexedDB
const storedAccount = await db.accounts.get(result.data!.id);
expect(storedAccount).toBeDefined();
expect(storedAccount!.name).toBe("Test Checking");

// Check sync queue
const { data: queueItem } = await supabase
  .from("sync_queue")
  .select("*")
  .eq("entity_type", "account")
  .eq("entity_id", result.data!.id)
  .single();

expect(queueItem).toBeDefined();
expect(queueItem!.operation.op).toBe("create");
```

**Test Case 2: Create category**

```typescript
import { createOfflineCategory } from "@/lib/offline/categories";

const categoryInput = {
  name: "Test Groceries",
  parent_id: null, // Root category
  color: "#10B981",
};

const result = await createOfflineCategory(categoryInput, userId);

expect(result.success).toBe(true);

// Check IndexedDB
const storedCategory = await db.categories.get(result.data!.id);
expect(storedCategory).toBeDefined();
expect(storedCategory!.name).toBe("Test Groceries");

// Check sync queue
const { data: queueItem } = await supabase
  .from("sync_queue")
  .select("*")
  .eq("entity_type", "category")
  .eq("entity_id", result.data!.id)
  .single();

expect(queueItem).toBeDefined();
expect(queueItem!.operation.op).toBe("create");
```

**Test Case 3: Queue count includes all types**

```typescript
// After creating transactions, accounts, and categories
const queueCount = await getQueueCount(userId);
// Should be 3 (1 transaction + 1 account + 1 category)
expect(queueCount).toBe(3);
```

**Expected**: Queue includes transactions, accounts, and categories

---

## 10. Toast Notifications Work ✓

**Test**: Create transaction via UI

**Expected**:

- Success: "Transaction created and queued for sync"
- Failure: Error message shown

---

## Success Criteria

- [ ] All unit tests pass
- [ ] Transactions add to queue on create
- [ ] Idempotency keys generated correctly
- [ ] Lamport clocks increment per entity
- [ ] Vector clocks initialized
- [ ] Rollback works on queue failure
- [ ] Queue count accurate
- [ ] Updates and deletes also queue
- [ ] Accounts and categories queue
- [ ] Toast notifications appear

---

## Common Issues

### Queued items not appearing in sync_queue

**Solution**: Check RLS policies allow insert for user's device

### Lamport clock doesn't increment

**Solution**: Verify meta table writes succeed in IndexedDB

### Rollback doesn't work

**Solution**: Ensure try/catch wraps queue insert and rollback logic executes

---

## Next Steps

Once all checkpoints pass:

1. Commit queue integration code
2. Move to **Chunk 024: Sync Processor**
3. Build processor to sync queued items

---

**Estimated Time**: 30-40 minutes to verify all checkpoints
