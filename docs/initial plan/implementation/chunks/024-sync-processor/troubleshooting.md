# Troubleshooting: Sync Processor

Common issues and solutions when working with the sync processor.

---

## Sync Not Working

### Problem: Queue items not syncing to Supabase

**Symptoms**:

- Items remain in sync_queue with status `queued`
- No console logs showing sync attempts
- Supabase tables don't show synced data

**Cause 1**: Processor not running

**Solution**:

Check processor status:

```typescript
console.log("Is processing:", syncProcessor.isProcessing);
console.log("Auto-sync manager active:", !!autoSyncManager.intervalId);
```

Verify auto-sync started:

```typescript
// Should be called after login
autoSyncManager.start(userId);
```

**Cause 2**: RLS policies blocking writes

**Solution**:

Test RLS policies:

```sql
-- Test as authenticated user in Supabase SQL Editor
-- Should succeed if RLS is correct
INSERT INTO transactions (id, date, description, amount_cents, type, household_id, device_id)
VALUES (
  gen_random_uuid(),
  '2024-01-15',
  'RLS test',
  100000,
  'expense',
  '00000000-0000-0000-0000-000000000001',
  'test-device'
);
```

If INSERT fails, check RLS policies:

```sql
-- List policies for transactions table
SELECT * FROM pg_policies WHERE tablename = 'transactions';
```

Ensure policy allows INSERT with device_id.

**Cause 3**: Network connectivity issues

**Solution**:

Check network status:

```typescript
console.log("Online:", navigator.onLine);
console.log("Supabase connected:", await supabase.from("transactions").select("id").limit(1));
```

Test Supabase connection:

```typescript
const { data, error } = await supabase.from("transactions").select("count").single();
if (error) console.error("Supabase not reachable:", error);
```

---

### Problem: Processor runs but items stay in `queued` state

**Symptoms**:

- Console shows "Processing N queue items"
- Items never transition to `syncing` or `completed`
- No errors thrown

**Cause**: Database transaction not committing

**Solution**:

Check queue status updates:

```typescript
// Add logging to updateQueueStatus
private async updateQueueStatus(id: string, status: string) {
  console.log(`Updating ${id} to ${status}`);
  const { error } = await supabase
    .from("sync_queue")
    .update({ status })
    .eq("id", id);

  if (error) console.error("Failed to update status:", error);
}
```

Verify updates reach database:

```sql
-- Check for recent status changes
SELECT id, status, updated_at
FROM sync_queue
ORDER BY updated_at DESC
LIMIT 10;
```

---

## ID Mapping Issues

### Problem: References broken after sync (Foreign Key Errors)

**Symptoms**:

- Transaction shows "Unknown Account" after sync
- Error: "violates foreign key constraint"
- Related entities not linked correctly

**Cause**: ID mapping not applied to foreign key references

**Solution**:

Ensure `replaceIds` called for all payloads:

```typescript
private async processItem(item: SyncQueueItem) {
  // CRITICAL: Replace temp IDs before syncing
  const payload = idMapping.replaceIds(item.operation.payload);

  console.log("Original payload:", item.operation.payload);
  console.log("After ID replacement:", payload);

  // Now sync with replaced IDs
  const result = await this.syncCreate(item.entity_type, payload);
}
```

Debug ID mappings:

```typescript
// Check what mappings exist
console.log("Current ID mappings:", idMapping.getAll());

// Manually add mapping if missing
idMapping.add("temp-account-123", "real-uuid-456");
```

---

### Problem: Temp IDs not replaced with server IDs

**Symptoms**:

- UI still shows `temp-xxx` IDs after sync
- IndexedDB contains temp IDs
- Supabase has real UUIDs but client doesn't know

**Cause**: Server ID not stored in mapping after create

**Solution**:

Verify mapping added after create:

```typescript
private async syncCreate(entityType: string, payload: any) {
  const { data, error } = await supabase
    .from(this.getTableName(entityType))
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;

  console.log("Created entity with server ID:", data.id);

  // CRITICAL: Return server ID
  return { serverId: data.id };
}

// In processItem:
if (item.operation.op === "create" && result.serverId) {
  console.log(`Mapping ${item.entity_id} → ${result.serverId}`);
  idMapping.add(item.entity_id, result.serverId);
}
```

Force mapping update:

```typescript
// Manually map temp IDs to server IDs
const { data: transactions } = await supabase
  .from("transactions")
  .select("id, description")
  .eq("device_id", deviceId);

// Find corresponding temp IDs in IndexedDB
const tempTransactions = await db.transactions.filter((tx) => tx.id.startsWith("temp-")).toArray();

// Create mappings
tempTransactions.forEach((temp) => {
  const server = transactions.find((t) => t.description === temp.description);
  if (server) {
    idMapping.add(temp.id, server.id);
    console.log(`Mapped ${temp.id} → ${server.id}`);
  }
});
```

---

### Problem: Circular reference with nested temp IDs

**Symptoms**:

- Category has temp parent_id that references another temp category
- Sync fails with "parent not found"

**Cause**: Parent entity not synced before child

**Solution**:

Order queue items by dependencies:

```typescript
async processQueue(userId: string) {
  const items = await getPendingQueueItems(userId);

  // Sort: creates before updates, parents before children
  const sorted = items.sort((a, b) => {
    // Creates first
    if (a.operation.op === "create" && b.operation.op !== "create") return -1;
    if (a.operation.op !== "create" && b.operation.op === "create") return 1;

    // Parents before children (check parent_id in payload)
    const aHasParent = a.operation.payload.parent_id?.startsWith("temp-");
    const bHasParent = b.operation.payload.parent_id?.startsWith("temp-");
    if (aHasParent && !bHasParent) return 1; // b goes first
    if (!aHasParent && bHasParent) return -1; // a goes first

    return 0;
  });

  // Process in sorted order
  for (const item of sorted) {
    await this.processItem(item);
  }
}
```

---

## Retry Logic Issues

### Problem: Stuck in infinite retry loop

**Symptoms**:

- Console shows retry attempts endlessly
- Same error repeats
- Queue item never fails or succeeds

**Cause**: Max retries not enforced

**Solution**:

Check retry count logic:

```typescript
private async handleError(item: SyncQueueItem, error: any) {
  const retryCount = item.retry_count + 1;

  console.log(`Retry ${retryCount}/${item.max_retries}`);

  // CRITICAL: Stop at max retries
  if (retryCount >= item.max_retries) {
    console.log("Max retries reached - marking failed");
    await this.updateQueueStatus(item.id, "failed", errorMessage);
    return { success: false, error: `Max retries reached: ${errorMessage}` };
  }

  // Continue retrying
  const delay = calculateRetryDelay(retryCount);
  await sleep(delay);

  // Update retry count in database
  await supabase
    .from("sync_queue")
    .update({ retry_count: retryCount, status: "queued" })
    .eq("id", item.id);
}
```

Force fail stuck items:

```sql
-- Mark items with excessive retries as failed
UPDATE sync_queue
SET status = 'failed', error_message = 'Exceeded maximum retries'
WHERE retry_count >= max_retries AND status != 'failed';
```

---

### Problem: Validation errors keep retrying

**Symptoms**:

- Error: "violates check constraint"
- Retry attempts all fail with same error
- Wasted retry attempts on non-retryable errors

**Cause**: All errors treated as retryable

**Solution**:

Classify errors:

```typescript
private async handleError(item: SyncQueueItem, error: any) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Check if error is non-retryable
  const nonRetryableErrors = [
    "violates check constraint",
    "violates foreign key constraint",
    "violates unique constraint",
    "invalid input syntax",
    "value too long",
  ];

  const isNonRetryable = nonRetryableErrors.some(msg =>
    errorMessage.toLowerCase().includes(msg)
  );

  if (isNonRetryable) {
    console.log("Non-retryable error - failing immediately:", errorMessage);
    await this.updateQueueStatus(item.id, "failed", errorMessage);
    return { success: false, error: errorMessage };
  }

  // Retryable error - continue with backoff
  const retryCount = item.retry_count + 1;
  if (retryCount >= item.max_retries) {
    await this.updateQueueStatus(item.id, "failed", errorMessage);
    return { success: false, error: `Max retries reached: ${errorMessage}` };
  }

  // Retry...
}
```

---

### Problem: Exponential backoff not working

**Symptoms**:

- Retries happen immediately (no delay)
- Network gets hammered with requests
- No observable backoff behavior

**Cause**: Sleep function not awaited

**Solution**:

Ensure `await` on sleep:

```typescript
// INCORRECT:
sleep(delay); // Not awaited!
await processItem(item);

// CORRECT:
await sleep(delay); // Must await
await processItem(item);
```

Verify delay calculation:

```typescript
function calculateRetryDelay(retryCount: number): number {
  const exponential = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s, 8s...
  const capped = Math.min(exponential, 30000); // Max 30s
  const jitter = Math.random() * 1000; // Add 0-1s randomness

  console.log(`Retry ${retryCount}: delay ${capped + jitter}ms`);

  return capped + jitter;
}
```

---

## Performance Issues

### Problem: Sync takes too long (slow processing)

**Symptoms**:

- 1000 items takes >5 minutes
- Browser becomes unresponsive
- UI freezes during sync

**Cause 1**: Sequential processing with network round-trips

**Solution**:

Batch Supabase operations:

```typescript
// Instead of:
for (const item of items) {
  await this.syncCreate(item.entity_type, item.operation.payload);
}

// Use batch insert:
const transactionsToCreate = items
  .filter((i) => i.entity_type === "transaction" && i.operation.op === "create")
  .map((i) => i.operation.payload);

if (transactionsToCreate.length > 0) {
  await supabase.from("transactions").insert(transactionsToCreate);
}
```

**Cause 2**: Too many items processed at once

**Solution**:

Process in chunks:

```typescript
async processQueue(userId: string) {
  const BATCH_SIZE = 50;
  let offset = 0;
  let totalSynced = 0;
  let totalFailed = 0;

  while (true) {
    const items = await getPendingQueueItems(userId, BATCH_SIZE, offset);
    if (items.length === 0) break;

    for (const item of items) {
      const result = await this.processItem(item);
      if (result.success) totalSynced++;
      else totalFailed++;
    }

    offset += BATCH_SIZE;

    // Give UI thread time to breathe
    await new Promise(r => setTimeout(r, 100));
  }

  return { synced: totalSynced, failed: totalFailed };
}
```

**Cause 3**: Large payloads

**Solution**:

Log payload sizes:

```typescript
const payloadSize = JSON.stringify(item.operation.payload).length;
if (payloadSize > 10000) {
  console.warn(`Large payload (${payloadSize} bytes) for ${item.entity_type}`);
}
```

---

### Problem: Memory leak with large sync queues

**Symptoms**:

- Browser memory usage grows
- App slows down over time
- Eventually crashes on large syncs

**Cause**: ID mappings not cleared

**Solution**:

Clear mappings after sync session:

```typescript
async processQueue(userId: string) {
  try {
    // Process items...
    const result = await this.processAllItems(userId);
    return result;
  } finally {
    // CRITICAL: Clear mappings to free memory
    idMapping.clear();
    console.log("Cleared ID mappings");
  }
}
```

Limit mapping size:

```typescript
class IDMappingManager {
  private mappings = new Map<string, string>();
  private readonly MAX_SIZE = 10000;

  add(tempId: string, serverId: string) {
    if (this.mappings.size >= this.MAX_SIZE) {
      console.warn("ID mapping limit reached - clearing old mappings");
      this.mappings.clear();
    }
    this.mappings.set(tempId, serverId);
  }
}
```

---

## Network Issues

### Problem: Sync fails with timeout errors

**Symptoms**:

- Error: "Network request failed"
- Error: "Timeout of XXXms exceeded"
- Works on fast connection, fails on slow

**Cause**: Supabase client timeout too short

**Solution**:

Increase Supabase timeout:

```typescript
// In supabase client setup
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: {
    schema: "public",
  },
  global: {
    headers: { "x-my-custom-header": "my-app-name" },
  },
  // Increase timeout for slow connections
  fetch: (url, options) => {
    return fetch(url, {
      ...options,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });
  },
});
```

Add timeout handling:

```typescript
private async syncWithTimeout(item: SyncQueueItem, timeoutMs = 15000) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Sync timeout")), timeoutMs)
  );

  const syncPromise = this.processItem(item);

  return Promise.race([syncPromise, timeoutPromise]);
}
```

---

### Problem: CORS errors when syncing

**Symptoms**:

- Error: "CORS policy blocked"
- Only happens in production
- Works locally

**Cause**: Supabase project URL mismatch

**Solution**:

Verify Supabase URL:

```typescript
console.log("Supabase URL:", import.meta.env.VITE_SUPABASE_URL);
// Should match your project URL exactly
```

Check Supabase dashboard:

- Settings → API → Project URL
- Ensure `.env` matches exactly

---

## Queue State Corruption

### Problem: Items stuck in `syncing` state forever

**Symptoms**:

- Status: `syncing` never changes
- Happened after browser crash or force close
- New syncs don't process these items

**Cause**: Processor crashed mid-sync without cleanup

**Solution**:

Reset stale `syncing` items:

```sql
-- Find items stuck in syncing for >5 minutes
UPDATE sync_queue
SET status = 'queued', retry_count = retry_count + 1
WHERE status = 'syncing'
  AND updated_at < NOW() - INTERVAL '5 minutes';
```

Add cleanup on processor start:

```typescript
async processQueue(userId: string) {
  // Clean up stale syncing items before starting
  await supabase
    .from("sync_queue")
    .update({ status: "queued" })
    .eq("status", "syncing")
    .eq("user_id", userId)
    .lt("updated_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

  // Now process queue normally
  const items = await getPendingQueueItems(userId);
  // ...
}
```

---

### Problem: Duplicate entries in Supabase

**Symptoms**:

- Same transaction appears twice
- Duplicate accounts with same name
- Idempotency not working

**Cause**: Idempotency key not included in sync

**Solution**:

Ensure idempotency key in payload:

```typescript
// When creating queue item
const queueItem = {
  entity_type: "transaction",
  entity_id: tempId,
  operation: {
    op: "create",
    payload: {
      ...transactionData,
    },
    idempotencyKey: `${deviceId}-transaction-${tempId}-${lamportClock}`,
  },
  // ...
};
```

Check server-side idempotency:

```sql
-- Server should deduplicate by idempotency key
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_events_idempotency
ON transaction_events(idempotency_key);
```

---

## Auto-Sync Issues

### Problem: Auto-sync not triggering

**Symptoms**:

- Manual sync works
- Auto-sync never fires
- No console logs from event listeners

**Cause**: Event listeners not registered

**Solution**:

Verify listeners attached:

```typescript
// After login, check listeners
console.log("Online listener:", window.onlineCallback);
console.log("Visibility listener:", document.visibilitychangeCallback);
console.log("Focus listener:", window.focusCallback);
```

Ensure `start()` called:

```typescript
// In App.tsx or auth effect
useEffect(() => {
  if (user?.id) {
    console.log("Starting auto-sync for user:", user.id);
    autoSyncManager.start(user.id);

    return () => {
      console.log("Stopping auto-sync");
      autoSyncManager.stop();
    };
  }
}, [user]);
```

---

### Problem: Auto-sync triggers too frequently

**Symptoms**:

- Sync fires every few seconds
- Multiple overlapping syncs
- Poor performance

**Cause**: Multiple event listeners or no debounce

**Solution**:

Add debounce to triggers:

```typescript
private lastSyncTime = 0;
private readonly MIN_SYNC_INTERVAL = 10000; // 10 seconds

private async triggerSync() {
  const now = Date.now();
  if (now - this.lastSyncTime < this.MIN_SYNC_INTERVAL) {
    console.log("Sync throttled - too soon since last sync");
    return;
  }

  this.lastSyncTime = now;
  await syncProcessor.processQueue(this.userId);
}
```

Prevent concurrent syncs:

```typescript
private isSyncing = false;

async processQueue(userId: string) {
  if (this.isSyncing) {
    console.log("Sync already in progress - skipping");
    return { synced: 0, failed: 0 };
  }

  this.isSyncing = true;
  try {
    // Process items...
  } finally {
    this.isSyncing = false;
  }
}
```

---

## Testing Issues

### Problem: Can't test sync in isolation

**Symptoms**:

- Tests fail with "supabase is not defined"
- Can't mock network failures
- Hard to test retry logic

**Cause**: Tight coupling to Supabase client

**Solution**:

Mock Supabase for tests:

```typescript
// In test file
import { vi } from "vitest";

const mockSupabase = {
  from: vi.fn(() => ({
    insert: vi.fn(() => Promise.resolve({ data: { id: "test-uuid" }, error: null })),
    update: vi.fn(() => Promise.resolve({ data: null, error: null })),
    delete: vi.fn(() => Promise.resolve({ data: null, error: null })),
  })),
};

// Inject mock
vi.mock("@/lib/supabase", () => ({ supabase: mockSupabase }));
```

Test retry logic:

```typescript
it("should retry 3 times before failing", async () => {
  let attempts = 0;

  mockSupabase.from = vi.fn(() => ({
    insert: vi.fn(() => {
      attempts++;
      if (attempts < 4) {
        return Promise.resolve({ data: null, error: new Error("Network error") });
      }
      return Promise.resolve({ data: { id: "success-uuid" }, error: null });
    }),
  }));

  const result = await syncProcessor.processItem(queueItem);

  expect(attempts).toBe(4); // 3 failures + 1 success
  expect(result.success).toBe(true);
});
```

---

## Prevention Tips

1. **Always use idempotency keys**: Prevents duplicate syncs
2. **Clear ID mappings after sessions**: Prevents memory leaks
3. **Classify errors**: Fail fast on validation errors
4. **Batch operations**: Faster syncs with fewer network calls
5. **Add timeouts**: Don't hang on slow networks
6. **Throttle auto-sync**: Prevent excessive sync attempts
7. **Clean up stale state**: Reset stuck `syncing` items on start
8. **Log everything**: Debug sync issues with comprehensive logging

---

## Quick Fixes

```typescript
// Force sync now
await syncProcessor.processQueue(userId);

// Clear ID mappings (free memory)
idMapping.clear();

// Reset failed items to retry
await supabase
  .from("sync_queue")
  .update({ status: "queued", retry_count: 0 })
  .eq("status", "failed");

// Reset stuck syncing items
await supabase
  .from("sync_queue")
  .update({ status: "queued" })
  .eq("status", "syncing")
  .lt("updated_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

// Manually map temp ID to server ID
idMapping.add("temp-abc123", "real-uuid-456");

// Check processor status
console.log({
  isProcessing: syncProcessor.isProcessing,
  autoSyncActive: !!autoSyncManager.intervalId,
  idMappings: idMapping.getAll().size,
});
```

---

## Getting Help

If you're stuck:

1. Check this troubleshooting guide first
2. Review sync processor logs in console
3. Check Supabase logs: Dashboard → Logs
4. Inspect sync_queue table for stuck items
5. Verify RLS policies allow operations
6. Test with slow network throttling
7. Check for JavaScript errors in DevTools

---

**Remember**: Sync failures are normal. The processor is designed to retry and recover. Focus on preventing data loss, not perfect first-try success.
