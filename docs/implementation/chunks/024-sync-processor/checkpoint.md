# Checkpoint: Sync Processor

Run these verifications to ensure sync processor works correctly.

---

## 1. Manual Sync Executes ✓

### Test in Browser Console

```typescript
// In browser console (with user logged in)
const result = await syncProcessor.processQueue(userId);
console.log(result); // { synced: N, failed: 0 }
```

**Expected**:

- No errors in console
- Returns `{ synced: number, failed: number }`
- Console shows: `Processing N queue items`

### Verify in Supabase

```sql
-- Check transactions table
SELECT id, description, created_at, device_id
FROM transactions
ORDER BY created_at DESC
LIMIT 10;
```

**Expected**: Recently synced items appear with:

- Real UUIDs (not temp-xxx)
- Correct device_id
- Proper timestamps

---

## 2. Temporary ID Replacement Works ✓

### Scenario: Create Transaction Offline, Sync Online

**Step 1**: Go offline (disable network in DevTools)

```typescript
// Create transaction while offline
const input = {
  date: "2024-01-15",
  description: "Offline test transaction",
  amount_cents: 150050,
  type: "expense",
  status: "pending",
  visibility: "household",
};

const result = await createOfflineTransaction(input, userId);
console.log("Temp ID:", result.data.id); // temp-abc123...
```

**Step 2**: Check IndexedDB

```typescript
// In console
const tx = await db.transactions.toArray();
console.log(tx.filter((t) => t.id.startsWith("temp-")));
// Should show transaction with temp ID
```

**Step 3**: Go online, trigger sync

```typescript
await syncProcessor.processQueue(userId);
```

**Step 4**: Check Supabase

```sql
SELECT id, description FROM transactions
WHERE description = 'Offline test transaction';
-- Should show real UUID
```

**Step 5**: Verify ID mapping

```typescript
// After sync
const mappings = idMapping.getAll();
console.log(mappings);
// Should show temp-abc123 → real-uuid mapping
```

**Step 6**: Verify UI updates

- Transaction list should show real UUID
- No "temp-" IDs visible in UI
- Data remains intact

---

## 3. Queue Status Transitions ✓

### Verify State Machine: queued → syncing → completed

**Check initial state**:

```sql
SELECT id, entity_type, status, retry_count, created_at
FROM sync_queue
WHERE status = 'queued'
ORDER BY created_at ASC
LIMIT 5;
```

**Start sync and monitor**:

```typescript
// Watch status changes
const watcher = setInterval(async () => {
  const { data } = await supabase
    .from("sync_queue")
    .select("id, status, retry_count")
    .order("created_at", { ascending: true });
  console.table(data);
}, 1000);

// Trigger sync
await syncProcessor.processQueue(userId);

// Stop watching
clearInterval(watcher);
```

**Expected transitions**:

1. Status: `queued` (initial)
2. Status: `syncing` (during processing)
3. Status: `completed` (after success)
4. `synced_at` timestamp populated

**Check final state**:

```sql
SELECT status, COUNT(*) as count
FROM sync_queue
GROUP BY status;
```

Expected:

- `completed`: Most items
- `queued`: 0 items (all processed)
- `failed`: 0 items (if no errors)

---

## 4. Retry Logic with Exponential Backoff ✓

### Simulate Network Failure

**Option A: Mock Supabase Error** (temporary):

```typescript
// In console - intercept supabase calls
const originalInsert = supabase.from("transactions").insert;
let attemptCount = 0;

supabase.from("transactions").insert = function (...args) {
  attemptCount++;
  console.log(`Attempt ${attemptCount}`);

  if (attemptCount < 3) {
    // Fail first 2 attempts
    return Promise.resolve({
      data: null,
      error: new Error("Simulated network error"),
    });
  }

  // Succeed on 3rd attempt
  return originalInsert.apply(this, args);
};

// Trigger sync
await syncProcessor.processQueue(userId);

// Restore original
supabase.from("transactions").insert = originalInsert;
```

**Expected behavior**:

- Attempt 1: Fails, wait ~1s
- Attempt 2: Fails, wait ~2s
- Attempt 3: Succeeds
- Total time: ~3-4 seconds

**Option B: Test with Real Network Issues**

1. Create offline transaction
2. Go online but throttle network (DevTools: Network → Slow 3G)
3. Trigger sync
4. Observe retry attempts in console

**Verify retry count in database**:

```sql
SELECT id, entity_type, status, retry_count, error_message
FROM sync_queue
WHERE retry_count > 0;
```

Expected: Items that failed show `retry_count > 0`

---

## 5. Auto-Sync Triggers Work ✓

### Trigger 1: Online Event

**Test**:

1. Go offline (DevTools: Network → Offline)
2. Create transaction offline
3. Go online (DevTools: Network → Online)
4. Check console: "Online - triggering sync"
5. Wait 2-3 seconds
6. Check Supabase: Transaction synced

**Expected**: Auto-sync triggers within 1-2 seconds of coming online

### Trigger 2: Visibility Change

**Test**:

1. Create offline transaction
2. Switch to another tab
3. Switch back to app tab
4. Check console: "Visible - triggering sync"
5. Check Supabase: Transaction synced

**Expected**: Sync triggers when tab becomes visible

### Trigger 3: Window Focus

**Test**:

1. Create offline transaction
2. Click on another application
3. Click back on browser window
4. Check console: "Focused - triggering sync"

**Expected**: Sync triggers when window regains focus

### Trigger 4: Periodic Sync (5 min)

**Test**:

1. Create offline transaction
2. Stay online, don't interact
3. Wait 5 minutes
4. Check console: Periodic sync should trigger

**Expected**: Auto-sync every 5 minutes while online

---

## 6. Error Handling and Failed Items ✓

### Test Max Retries Exceeded

**Simulate permanent failure**:

```typescript
// Cause validation error (will fail all retries)
const input = {
  date: "invalid-date", // Invalid format
  description: "Test",
  amount_cents: -100, // Negative amount (violates constraint)
  type: "expense",
  status: "pending",
  visibility: "household",
};

await createOfflineTransaction(input, userId);
await syncProcessor.processQueue(userId);
```

**Check queue**:

```sql
SELECT id, status, retry_count, error_message
FROM sync_queue
WHERE status = 'failed';
```

**Expected**:

- Status: `failed`
- `retry_count`: 3 (max reached)
- `error_message`: Descriptive error

### Test Error Message Logging

**Verify error details**:

```typescript
const { data: failedItems } = await supabase.from("sync_queue").select("*").eq("status", "failed");

console.table(
  failedItems.map((i) => ({
    entity: i.entity_type,
    error: i.error_message,
    retries: i.retry_count,
  }))
);
```

**Expected**: Clear error messages indicating failure reason

---

## 7. Concurrent Operations ✓

### Test Multiple Queue Items Sync

**Create multiple offline items**:

```typescript
// Create 10 transactions offline
for (let i = 0; i < 10; i++) {
  await createOfflineTransaction(
    {
      date: "2024-01-15",
      description: `Test transaction ${i}`,
      amount_cents: 100000 + i * 1000,
      type: "expense",
      status: "pending",
      visibility: "household",
    },
    userId
  );
}

// Sync all at once
const start = Date.now();
const result = await syncProcessor.processQueue(userId);
const duration = Date.now() - start;

console.log(`Synced ${result.synced} items in ${duration}ms`);
```

**Expected**:

- All 10 items sync successfully
- Process completes in <5 seconds
- No duplicate entries in Supabase
- All temp IDs replaced

---

## 8. ID Mapping Integrity ✓

### Test Related Entity References

**Create account and transaction offline**:

```typescript
// 1. Create account offline
const account = await createOfflineAccount(
  {
    name: "Test Account",
    type: "checking",
    visibility: "household",
    initial_balance_cents: 0,
    is_active: true,
  },
  userId
);

const tempAccountId = account.data.id; // temp-xyz

// 2. Create transaction referencing temp account ID
const transaction = await createOfflineTransaction(
  {
    date: "2024-01-15",
    description: "Transaction for temp account",
    amount_cents: 100000,
    type: "expense",
    account_id: tempAccountId, // References temp ID
    status: "pending",
    visibility: "household",
  },
  userId
);

// 3. Sync both
await syncProcessor.processQueue(userId);

// 4. Verify references updated
const { data: syncedTx } = await supabase
  .from("transactions")
  .select("id, account_id, description")
  .eq("description", "Transaction for temp account")
  .single();

const { data: syncedAcct } = await supabase
  .from("accounts")
  .select("id, name")
  .eq("name", "Test Account")
  .single();

console.log("Account ID:", syncedAcct.id);
console.log("Transaction account_id:", syncedTx.account_id);
console.log("IDs match:", syncedTx.account_id === syncedAcct.id);
```

**Expected**:

- Transaction's `account_id` equals account's real UUID
- No temp- IDs in Supabase
- Referential integrity maintained

---

## 9. Performance Benchmarks ✓

### Test Large Queue (1000 items)

```typescript
// Create 1000 offline transactions
console.time("create-1000");
for (let i = 0; i < 1000; i++) {
  await createOfflineTransaction(
    {
      date: "2024-01-15",
      description: `Bulk test ${i}`,
      amount_cents: 100000,
      type: "expense",
      status: "pending",
      visibility: "household",
    },
    userId
  );
}
console.timeEnd("create-1000");

// Sync all
console.time("sync-1000");
const result = await syncProcessor.processQueue(userId);
console.timeEnd("sync-1000");

console.log(`Synced: ${result.synced}, Failed: ${result.failed}`);
```

**Expected performance**:

- Create 1000: <30 seconds
- Sync 1000: <60 seconds
- Success rate: >99%
- No browser freeze/hang

---

## 10. Auto-Sync Manager Lifecycle ✓

### Test Start/Stop

```typescript
// Check manager starts with auth
console.log("Logging in...");
// After login, check listeners registered
console.log("Event listeners:", {
  online: !!window.listeners?.online,
  visibilitychange: !!document.listeners?.visibilitychange,
  focus: !!window.listeners?.focus,
});

// Logout
console.log("Logging out...");
// Verify cleanup
console.log("Listeners removed:", {
  intervalCleared: !autoSyncManager.intervalId,
});
```

**Expected**:

- Listeners registered on login
- Periodic sync starts
- Cleanup on logout
- No memory leaks

---

## 11. Query Cache Invalidation ✓

### Verify UI Updates After Sync

**Test**:

1. Load transaction list (should show offline items with temp IDs)
2. Trigger sync
3. Check UI updates automatically

**Verify**:

```typescript
// Before sync
queryClient.getQueryData(["transactions", "offline"]);
// Should show temp-xxx IDs

// After sync
queryClient.invalidateQueries({ queryKey: ["offline"] });
await new Promise((r) => setTimeout(r, 1000)); // Wait for refetch

queryClient.getQueryData(["transactions", "offline"]);
// Should show real UUIDs
```

**Expected**:

- UI re-fetches from IndexedDB after invalidation
- Temp IDs replaced with server IDs in display
- No stale data shown

---

## Success Criteria

Complete this checklist:

- [ ] Manual sync works (processQueue returns success)
- [ ] Temporary IDs replaced with server UUIDs
- [ ] ID mappings tracked correctly
- [ ] Retry logic works (3 attempts with backoff)
- [ ] Auto-sync on online event
- [ ] Auto-sync on visibility change
- [ ] Auto-sync on window focus
- [ ] Periodic sync every 5 minutes
- [ ] Queue status transitions (queued → syncing → completed)
- [ ] Failed items marked with error messages
- [ ] Max retries respected (no infinite loops)
- [ ] Non-retryable errors fail immediately (validation errors)
- [ ] Related entity references maintained
- [ ] Performance acceptable (1000 items <60s)
- [ ] No memory leaks on logout
- [ ] Query cache invalidates after sync
- [ ] UI updates reflect synced data
- [ ] **End-to-end flow tested** (offline write → queue → sync → Supabase)

---

## 12. End-to-End Integration Test ✓

### Verify Complete Flow: Offline Write → Queue → Sync

This test verifies that chunks 021, 023, and 024 work together correctly.

**Scenario**: Create a transaction offline, verify it enters queue, then syncs to Supabase

**Step 1**: Create offline transaction (requires chunk 021)

```typescript
// Ensure you're using the offline write function from chunk 021
import { createOfflineTransaction } from "@/lib/offline/transactions";

const userId = "your-user-id"; // From auth store

const transactionInput = {
  date: "2024-01-15",
  description: "End-to-end test transaction",
  amount_cents: 250000,
  type: "expense",
  account_id: "your-account-id",
  category_id: "your-category-id",
  status: "pending",
  visibility: "household",
};

const result = await createOfflineTransaction(transactionInput, userId);
const tempId = result.data.id;

console.log("Created transaction with temp ID:", tempId);
```

**Step 2**: Verify in sync queue (chunk 023 integration)

```typescript
// Check that chunk 023 added it to queue
const { data: queueItem } = await supabase
  .from("sync_queue")
  .select("*")
  .eq("entity_id", tempId)
  .single();

// Verify queue item properties
expect(queueItem).toBeDefined();
expect(queueItem.entity_type).toBe("transaction");
expect(queueItem.status).toBe("queued");
expect(queueItem.retry_count).toBe(0);
expect(queueItem.operation.op).toBe("create");
expect(queueItem.operation.payload.description).toBe("End-to-end test transaction");
expect(queueItem.operation.idempotencyKey).toMatch(/^device-.+-transaction-.+-\d+$/);

console.log("✓ Queue item created correctly");
```

**Step 3**: Process queue (chunk 024)

```typescript
// Trigger sync processor
import { syncProcessor } from "@/lib/sync/processor";

const syncResult = await syncProcessor.processQueue(userId);

console.log("Sync result:", syncResult);
// Expected: { synced: 1, failed: 0 }

expect(syncResult.synced).toBeGreaterThan(0);
expect(syncResult.failed).toBe(0);

console.log("✓ Queue processed successfully");
```

**Step 4**: Verify transaction in Supabase

```typescript
// Check that transaction was created with real UUID
const { data: syncedTransaction } = await supabase
  .from("transactions")
  .select("*")
  .eq("description", "End-to-end test transaction")
  .single();

expect(syncedTransaction).toBeDefined();
expect(syncedTransaction.id).not.toMatch(/^temp-/); // Real UUID, not temp
expect(syncedTransaction.amount_cents).toBe(250000);
expect(syncedTransaction.description).toBe("End-to-end test transaction");
expect(syncedTransaction.device_id).toBeDefined();

console.log("✓ Transaction synced to Supabase with ID:", syncedTransaction.id);
```

**Step 5**: Verify ID mapping

```typescript
// Check that temp ID was mapped to server ID
import { idMapping } from "@/lib/sync/idMapping";

const serverIds = idMapping.getAll();
console.log("ID mappings:", Array.from(serverIds.entries()));

// Temp ID should be mapped to server ID
const mappedServerId = idMapping.get(tempId);
expect(mappedServerId).toBe(syncedTransaction.id);

console.log("✓ ID mapping correct:", tempId, "→", mappedServerId);
```

**Step 6**: Verify queue item marked completed

```typescript
const { data: completedQueueItem } = await supabase
  .from("sync_queue")
  .select("*")
  .eq("entity_id", tempId)
  .single();

expect(completedQueueItem.status).toBe("completed");
expect(completedQueueItem.synced_at).toBeDefined();

console.log("✓ Queue item marked as completed");
```

**Step 7**: Verify IndexedDB updated with server ID (optional)

```typescript
// If your implementation updates IndexedDB with server IDs
import { db } from "@/lib/dexie";

const localTransaction = await db.transactions.get(syncedTransaction.id);

// Local should now have server ID
expect(localTransaction).toBeDefined();
expect(localTransaction.id).toBe(syncedTransaction.id); // Server ID, not temp

console.log("✓ IndexedDB updated with server ID");
```

**Expected Full Flow**:

```
1. createOfflineTransaction()
   ↓ (chunk 021)
   - Writes to IndexedDB with temp ID
   - Calls addToSyncQueue()
   ↓ (chunk 023)
   - Creates sync queue item with idempotency key
   - Status: 'queued'
   ↓ (chunk 024)
2. syncProcessor.processQueue()
   - Fetches pending items
   - Updates status: 'syncing'
   - Sends to Supabase
   - Receives server ID
   - Updates status: 'completed'
   - Stores ID mapping
   ↓
3. Transaction exists in Supabase with real UUID
4. Queue item marked completed
5. Temp ID → Server ID mapping stored
```

**Success Criteria**:

- [ ] Offline transaction creates temp ID
- [ ] Queue item created with correct structure
- [ ] Idempotency key generated correctly
- [ ] Processor syncs item to Supabase
- [ ] Real UUID assigned by server
- [ ] ID mapping tracked (temp → server)
- [ ] Queue item marked completed
- [ ] No duplicate entries in Supabase

**Common Issues**:

- **Queue item not found**: Chunk 023 might not be wired correctly
- **Sync fails with RLS error**: Check RLS policies allow device_id insertion
- **Temp ID not mapped**: Check `idMapping.add()` is called after successful sync
- **Duplicate entries**: Idempotency key not being used or not unique

---

## Common Issues During Verification

### Issue: Sync doesn't trigger automatically

**Check**:

```typescript
console.log("Auto-sync running:", !!autoSyncManager.intervalId);
```

**Fix**: Ensure `autoSyncManager.start(userId)` called after login

### Issue: Temp IDs not replaced

**Check ID mapping**:

```typescript
console.log(idMapping.getAll());
```

**Fix**: Ensure `replaceIds` called before sending to Supabase

### Issue: RLS blocks sync

**Check Supabase logs**: Settings → Logs → Show queries

**Fix**: Verify RLS policies allow device_id insertion

---

## Next Steps

Once all checkpoints pass:

1. Clear test data from IndexedDB and Supabase
2. Commit sync processor code
3. Move to **Chunk 025: Sync UI Indicators**

---

**Estimated Time**: 30-45 minutes to verify all checkpoints
