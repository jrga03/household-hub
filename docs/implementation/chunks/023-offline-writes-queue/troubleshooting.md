# Troubleshooting: Offline Writes Queue

Common issues when integrating offline writes with sync queue.

---

## Queue Integration Issues

### Problem: Items not appearing in sync_queue

**Symptoms**: Transaction created in IndexedDB but not in sync_queue

**Cause**: RLS policy blocking insert OR Supabase client not authenticated

**Solution**:

Check authentication:

```typescript
const {
  data: { user },
} = await supabase.auth.getUser();
console.log("User:", user?.id); // Should not be null
```

Check RLS policy:

```sql
-- Test insert as authenticated user
INSERT INTO sync_queue (
  entity_type, entity_id, operation, device_id, user_id
) VALUES (
  'transaction', 'test', '{}'::jsonb,
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  auth.uid()
);
```

---

### Problem: Duplicate queue items created

**Symptoms**: Same transaction has multiple queue entries

**Cause**: Mutation called multiple times OR idempotency key generation failed

**Solution**:

Add idempotency check before insert:

```typescript
// Check if already queued
const { data: existing } = await supabase
  .from("sync_queue")
  .select("id")
  .eq("operation->>idempotencyKey", idempotencyKey)
  .single();

if (existing) {
  console.log("Already queued, skipping");
  return { success: true };
}
```

---

### Problem: Rollback doesn't work

**Symptoms**: IndexedDB has transaction but queue insert failed

**Cause**: Rollback code not executing OR error not caught

**Solution**:

Ensure proper error handling:

```typescript
try {
  await db.transactions.add(transaction);

  const queueResult = await addToSyncQueue(...);
  if (!queueResult.success) {
    throw new Error("Queue failed");
  }
} catch (error) {
  // Rollback
  try {
    await db.transactions.delete(transaction.id);
  } catch (rollbackError) {
    console.error("Rollback failed:", rollbackError);
  }
  throw error;
}
```

---

## Idempotency Key Issues

### Problem: Idempotency keys not unique

**Symptoms**: Two different operations have same key

**Cause**: Lamport clock not incrementing OR device ID not unique

**Solution**:

Verify Lamport clock increments:

```typescript
const clock1 = await getNextLamportClock("entity-1");
const clock2 = await getNextLamportClock("entity-1");
console.log(clock1, clock2); // Should be sequential (1, 2)
```

Check device ID:

```typescript
const deviceId = await deviceManager.getDeviceId();
console.log("Device ID:", deviceId); // Should be consistent
```

---

### Problem: Can't parse idempotency key

**Symptoms**: `parseIdempotencyKey` returns null

**Cause**: Key format incorrect

**Solution**:

Check key format:

```typescript
const key = "device-abc-transaction-tx123-5";
const parsed = parseIdempotencyKey(key);
console.log(parsed);
// { deviceId, entityType, entityId, lamportClock }
```

Ensure generation follows format:

```typescript
// Correct format
`${deviceId}-${entityType}-${entityId}-${lamportClock}`;

// Don't use special characters in entity IDs
const entityId = "tx-123"; // OK
const entityId = "tx/123"; // BAD (/ breaks parsing)
```

---

## Lamport Clock Issues

### Problem: Clock doesn't increment

**Symptoms**: All operations have lamportClock = 1

**Cause**: Meta table writes failing OR wrong storage key

**Solution**:

Test meta table:

```typescript
await db.meta.put({ key: "test", value: 123 });
const result = await db.meta.get("test");
console.log(result); // { key: "test", value: 123 }
```

Check key format:

```typescript
// Correct
const key = `lamport-${entityId}`;

// Wrong
const key = `lamport_${entityId}`; // Different key!
```

---

### Problem: Clock resets unexpectedly

**Symptoms**: Lamport clock jumps back to lower value

**Cause**: Meta table cleared OR IndexedDB corruption

**Solution**:

Persist clocks before clearing:

```typescript
// Export clocks before clearing
async function exportClocks() {
  const clocks = await db.meta.where("key").startsWith("lamport-").toArray();

  localStorage.setItem("lamport-clocks-backup", JSON.stringify(clocks));
}

// Restore after clear
async function restoreClocks() {
  const backup = localStorage.getItem("lamport-clocks-backup");
  if (backup) {
    const clocks = JSON.parse(backup);
    await db.meta.bulkPut(clocks);
  }
}
```

---

## Vector Clock Issues

### Problem: Vector clock not initialized

**Symptoms**: `vectorClock` is empty object `{}`

**Cause**: `incrementVectorClock` not called OR device ID missing

**Solution**:

Verify initialization:

```typescript
const vectorClock = await incrementVectorClock("entity-1");
console.log(vectorClock);
// Should have: { "device-xyz": 1 }
```

Ensure device ID ready:

```typescript
const deviceId = await deviceManager.getDeviceId();
if (!deviceId || deviceId === "unknown") {
  throw new Error("Device ID not initialized");
}
```

---

### Problem: Vector clock merge incorrect

**Symptoms**: After merge, some device clocks lost

**Cause**: Merge logic incorrect

**Solution**:

Test merge function:

```typescript
const v1 = { "device-1": 5, "device-2": 3 };
const v2 = { "device-1": 4, "device-3": 2 };

const merged = mergeVectorClocks(v1, v2);
console.log(merged);
// Expected: { "device-1": 5, "device-2": 3, "device-3": 2 }
```

---

## Performance Issues

### Problem: Queue inserts slow down app

**Symptoms**: UI freezes when creating transactions

**Cause**: Synchronous Supabase calls blocking

**Solution**:

Make queue insert fire-and-forget:

```typescript
// Don't await queue insert
createOfflineTransaction(input, userId).then((result) => {
  // Queue happens in background
  addToSyncQueue(...).catch((error) => {
    console.error("Queue failed:", error);
    // Still return success to user
  });
});
```

Or use queue worker:

```typescript
// Queue locally first
await db.pendingQueue.add({ entityType, entityId, op, payload });

// Background worker processes queue
setInterval(async () => {
  const pending = await db.pendingQueue.toArray();
  for (const item of pending) {
    await addToSyncQueue(...);
    await db.pendingQueue.delete(item.id);
  }
}, 5000); // Every 5 seconds
```

---

### Problem: Too many queue items slow down queries

**Symptoms**: `getQueueCount` takes >1s

**Cause**: Large queue not indexed properly

**Solution**:

Ensure indexes exist (from chunk 022):

```sql
CREATE INDEX IF NOT EXISTS idx_sync_queue_user_device
ON sync_queue(user_id, device_id, status);
```

Or paginate results:

```typescript
async function getQueueCount(userId: string, deviceId: string): Promise<number> {
  // Use count with index hint
  const { count } = await supabase
    .from("sync_queue")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .eq("status", "queued");

  return count || 0;
}
```

---

## Testing Issues

### Problem: Tests interfere with production data

**Symptoms**: Test queue items appear in production

**Cause**: Tests using production Supabase project

**Solution**:

Use test project:

```typescript
// In test setup
const TEST_SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const TEST_SUPABASE_KEY = process.env.TEST_SUPABASE_ANON_KEY;

const testSupabase = createClient(TEST_SUPABASE_URL, TEST_SUPABASE_KEY);
```

Or mock Supabase:

```typescript
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      insert: vi.fn(),
      select: vi.fn(),
      // ...
    }),
  },
}));
```

---

## Prevention Tips

1. **Always rollback on queue failure**
2. **Test idempotency key uniqueness**
3. **Persist Lamport clocks to avoid resets**
4. **Use transactions for atomic operations**
5. **Monitor queue size and clean up**
6. **Test with poor network conditions**
7. **Handle device ID changes gracefully**

---

## Quick Fixes

```typescript
// Reset all clocks (DANGEROUS - use cautiously)
await db.meta.where("key").startsWith("lamport-").delete();

// Clear queue for device
const deviceId = await deviceManager.getDeviceId();
await supabase.from("sync_queue").delete().eq("device_id", deviceId);

// Check queue health
const { data } = await supabase.from("sync_queue").select("status, COUNT(*)").group("status");

console.log("Queue status:", data);
// { queued: 10, failed: 2, completed: 100 }

// Verify idempotency keys unique
const { data: duplicates } = await supabase
  .from("sync_queue")
  .select("operation->>'idempotencyKey' AS key, COUNT(*)")
  .group("key")
  .having("COUNT(*) > 1");

if (duplicates.length > 0) {
  console.error("Duplicate keys found:", duplicates);
}
```

---

**Remember**: The sync queue is the durable layer. Test atomicity thoroughly to prevent data loss.
