# Troubleshooting: Sync Realtime

Common issues and solutions when implementing realtime sync.

---

## Subscription Issues

### Problem: Realtime subscriptions not connecting

**Symptoms**:

- Console shows "CHANNEL_ERROR"
- Changes don't propagate between tabs
- `supabase.getChannels()` returns empty array

**Cause 1**: Realtime not enabled in Supabase dashboard

**Solution**: Enable realtime for tables:

1. Open Supabase Dashboard → Database → Replication
2. Select tables: `transactions`, `accounts`, `categories`, `budgets`
3. Enable "Insert", "Update", "Delete" events
4. Click "Save"

**Cause 2**: RLS policies blocking SELECT

**Solution**: Ensure SELECT policy exists for realtime:

```sql
-- Realtime requires SELECT permission
CREATE POLICY "Allow realtime SELECT" ON transactions
FOR SELECT
USING (household_id IN (
  SELECT household_id FROM profiles WHERE id = auth.uid()
));
```

---

### Problem: Only some tables sync, others don't

**Symptoms**:

- Transactions sync works
- But accounts/categories don't sync

**Cause**: Subscriptions not created for all tables

**Solution**: Verify all subscriptions initialized:

```javascript
const channels = supabase.getChannels();
console.log(
  "Channels:",
  channels.map((c) => c.topic)
);

// Expected:
// ['transactions-changes', 'accounts-changes', 'categories-changes', 'budgets-changes']
```

If missing, check `subscribeToTable()` is called for each table in `initialize()`.

---

### Problem: Subscription connects but no events received

**Symptoms**:

- Console shows "SUBSCRIBED"
- But `handleChange` never called
- Changes don't propagate

**Cause**: Event filter too restrictive or table name mismatch

**Solution**: Verify event configuration:

```typescript
.on("postgres_changes", {
  event: "*",  // ← Must be "*" for all events
  schema: "public",  // ← Must match database schema
  table: "transactions",  // ← Must match exact table name
}, handleChange)
```

**Debug**: Add logging to handler:

```typescript
private handleChange = async (payload) => {
  console.log("Event received:", payload);  // ← Should see this
  // ...
};
```

---

## Propagation Issues

### Problem: Changes propagate very slowly (>5 seconds)

**Symptoms**:

- Changes eventually appear
- But takes 5-10 seconds instead of <2 seconds

**Cause 1**: Network latency or slow connection

**Solution**: Check network speed:

```javascript
// Measure propagation latency
const start = Date.now();
await db.transactions.add({
  /* ... */
});

// In other tab:
db.transactions.hook("creating", () => {
  console.log(`Latency: ${Date.now() - start}ms`);
});
```

If >2000ms consistently, check:

- Internet connection speed
- Supabase region (use closest region)
- Database performance (check Supabase metrics)

**Cause 2**: Too many subscriptions overloading connection

**Solution**: Limit subscriptions, use filters:

```typescript
.on("postgres_changes", {
  event: "*",
  schema: "public",
  table: "transactions",
  filter: "household_id=eq.household-123",  // ← Filter at source
}, handleChange)
```

---

### Problem: Changes don't propagate across tabs

**Symptoms**:

- Tab A creates transaction
- Tab B doesn't receive it
- No errors in console

**Cause 1**: Both tabs using same Supabase client instance

**Solution**: Each tab needs separate subscription:

```typescript
// Ensure each call to initialize() creates new subscriptions
async initialize() {
  // Don't reuse existing subscriptions
  if (this.subscriptions.size > 0) {
    await this.cleanup();
  }

  // Create fresh subscriptions
  await this.subscribeToTable("transactions");
}
```

**Cause 2**: IndexedDB not updating UI

**Solution**: Ensure UI listens to IndexedDB changes:

```typescript
// Use Dexie live queries
const transactions = useLiveQuery(() => db.transactions.toArray());

// Or use TanStack Query with refetch on window focus
const { data } = useQuery({
  queryKey: ["transactions"],
  queryFn: () => db.transactions.toArray(),
  refetchOnWindowFocus: true,
});
```

---

## Conflict Resolution Issues

### Problem: Concurrent edits cause data loss

**Symptoms**:

- User A edits amount to ₱1,000
- User B edits description
- After sync, description lost

**Cause**: Not integrating conflict detection in handleUpdate

**Solution**: Add conflict detection:

```typescript
private async handleUpdate(tableName, newRecord, oldRecord) {
  const localRecord = await db[tableName].get(newRecord.id);

  if (localRecord) {
    // Build events for conflict detection
    const localEvent = {
      entityId: newRecord.id,
      vectorClock: localRecord.vector_clock || {},
      lamportClock: localRecord.lamport_clock || 0,
      deviceId: await getDeviceId(),
      payload: localRecord,
      op: "update",
    };

    const remoteEvent = {
      entityId: newRecord.id,
      vectorClock: newRecord.vector_clock || {},
      lamportClock: newRecord.lamport_clock || 0,
      deviceId: newRecord.device_id,
      payload: newRecord,
      op: "update",
    };

    // Detect conflict
    const detection = detectConflict(localEvent, remoteEvent);

    if (detection.hasConflict) {
      // Resolve and apply winner
      const conflict = await logConflict(localEvent, remoteEvent);
      const resolution = await conflictResolutionEngine.resolveConflict(
        localEvent,
        remoteEvent
      );
      await conflictResolutionEngine.logResolution(conflict, resolution);
      await db[tableName].put(resolution.winner.payload);
      return;
    }
  }

  // No conflict - apply remote
  await db[tableName].put(newRecord);
}
```

---

## Connection Issues

### Problem: Connection drops frequently

**Symptoms**:

- Status switches between "online" and "offline" repeatedly
- Sync indicator flickers

**Cause**: Network instability or browser throttling

**Solution 1**: Add connection stability check:

```typescript
// Debounce status changes
import { debounce } from "lodash-es";

const setStatusDebounced = debounce((status) => {
  useSyncStore.getState().setStatus(status);
}, 1000); // Wait 1 second before updating
```

**Solution 2**: Implement reconnection backoff:

```typescript
private reconnectAttempts = 0;
private maxReconnectAttempts = 5;

async handleReconnection() {
  if (this.reconnectAttempts >= this.maxReconnectAttempts) {
    console.error("Max reconnection attempts reached");
    useSyncStore.getState().setStatus("error");
    return;
  }

  const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
  console.log(`Reconnecting in ${backoffMs}ms (attempt ${this.reconnectAttempts + 1})`);

  await new Promise(resolve => setTimeout(resolve, backoffMs));

  try {
    await this.fetchLatestChanges();
    this.reconnectAttempts = 0;  // Reset on success
    useSyncStore.getState().setStatus("online");
  } catch (err) {
    this.reconnectAttempts++;
    this.handleReconnection();  // Retry
  }
}
```

---

### Problem: iOS Safari stops syncing in background

**Symptoms**:

- Works fine on desktop
- iOS Safari: Stop syncing when app backgrounded
- Resumes when app returns to foreground

**Cause**: iOS suspends WebSocket connections in background tabs

**Solution**: Implement focus-based reconnection:

```typescript
// In App.tsx or realtime-sync.ts initialization
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    console.log("App visible - reconnecting");
    realtimeSync.handleReconnection();
  }
});

// Also handle page focus
window.addEventListener("focus", () => {
  console.log("Window focused - reconnecting");
  realtimeSync.handleReconnection();
});
```

---

## Performance Issues

### Problem: High memory usage with many subscriptions

**Symptoms**:

- Browser slows down over time
- DevTools shows increasing memory
- Eventually crashes

**Cause**: Event handlers not cleaned up or memory leaks

**Solution**: Ensure proper cleanup:

```typescript
async cleanup() {
  // Unsubscribe from all channels
  for (const [tableName, subscription] of this.subscriptions) {
    await supabase.removeChannel(subscription);
  }

  this.subscriptions.clear();
  this.isInitialized = false;

  // Clear any pending timeouts/intervals
  if (this.healthCheckInterval) {
    clearInterval(this.healthCheckInterval);
  }
}

// Call cleanup on unmount
useEffect(() => {
  realtimeSync.initialize();

  return () => {
    realtimeSync.cleanup();  // ← Critical
  };
}, []);
```

---

### Problem: Rapid updates cause UI to freeze

**Symptoms**:

- Batch import of 100 transactions
- UI becomes unresponsive
- Browser "Page Unresponsive" warning

**Cause**: Too many synchronous UI updates

**Solution**: Batch updates and debounce UI refreshes:

```typescript
import { debounce } from "lodash-es";

// Batch updates
private updateBatch: any[] = [];
private processBatch = debounce(async () => {
  const batch = [...this.updateBatch];
  this.updateBatch = [];

  // Apply all updates at once
  await db.transaction("rw", db.transactions, async () => {
    for (const record of batch) {
      await db.transactions.put(record);
    }
  });

  console.log(`Processed ${batch.length} updates in batch`);
}, 300);

private async handleInsert(tableName, record) {
  this.updateBatch.push(record);
  this.processBatch();
}
```

---

## Data Integrity Issues

### Problem: Duplicate records created

**Symptoms**:

- Same transaction appears twice
- Different IDs but same data

**Cause**: INSERT event received multiple times or race condition

**Solution**: Check for existing record before inserting:

```typescript
private async handleInsert(tableName, record) {
  const table = db[tableName];

  // Check if already exists
  const existing = await table.get(record.id);
  if (existing) {
    console.log(`Record ${record.id} already exists - skipping`);
    return;
  }

  // Also check by unique fields if ID might be different
  const duplicate = await table
    .where("created_at")
    .equals(record.created_at)
    .and(r =>
      r.amount_cents === record.amount_cents &&
      r.description === record.description
    )
    .first();

  if (duplicate) {
    console.log("Duplicate detected by content - skipping");
    return;
  }

  await table.add(record);
}
```

---

### Problem: Updates overwrite newer local changes

**Symptoms**:

- User edits transaction offline
- Remote update arrives
- User's offline edit lost

**Cause**: Not comparing timestamps before applying updates

**Solution**: Check timestamps:

```typescript
private async handleUpdate(tableName, newRecord, oldRecord) {
  const table = db[tableName];
  const local = await table.get(newRecord.id);

  if (local) {
    // Compare timestamps
    const localTime = new Date(local.updated_at).getTime();
    const remoteTime = new Date(newRecord.updated_at).getTime();

    if (localTime > remoteTime) {
      console.log("Local is newer - keeping local version");
      return;
    }
  }

  // Remote is newer or no local version
  await table.put(newRecord);
}
```

---

## Browser-Specific Issues

### Problem: Firefox doesn't receive realtime events

**Symptoms**:

- Works in Chrome
- Firefox: Subscriptions connect but no events

**Cause**: Firefox WebSocket implementation quirks

**Solution**: Check Firefox-specific WebSocket settings:

```typescript
// Add timeout to subscription
.subscribe((status, err) => {
  if (status === "SUBSCRIBED") {
    console.log("Subscribed");

    // Firefox workaround: Send ping to keep connection alive
    setInterval(() => {
      subscription.send({
        type: "broadcast",
        event: "ping",
      });
    }, 30000);  // Every 30 seconds
  }
})
```

---

### Problem: Safari private mode blocks IndexedDB

**Symptoms**:

- Realtime works
- But IndexedDB throws "QuotaExceededError"

**Cause**: Safari private mode has strict storage limits

**Solution**: Detect and handle gracefully:

```typescript
async function checkIndexedDBAvailable() {
  try {
    const testDB = await Dexie.open("test-db");
    await testDB.delete();
    return true;
  } catch (err) {
    console.error("IndexedDB not available:", err);
    return false;
  }
}

// In app initialization
if (!(await checkIndexedDBAvailable())) {
  alert("This app requires IndexedDB. Please disable private browsing mode.");
  // Fallback to in-memory storage or warn user
}
```

---

## Testing Issues

### Problem: Hard to test realtime sync in unit tests

**Symptoms**:

- Need to mock Supabase realtime
- Complex test setup

**Solution**: Extract testable logic, mock subscriptions:

```typescript
// In tests
import { vi } from "vitest";

// Mock Supabase
const mockSubscription = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn(),
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => mockSubscription),
    getChannels: vi.fn(() => []),
  },
}));

// Then test
describe("RealtimeSync", () => {
  it("should handle INSERT event", async () => {
    const sync = new RealtimeSync();
    await sync.initialize();

    // Simulate INSERT event
    const handler = mockSubscription.on.mock.calls[0][2];
    await handler({
      eventType: "INSERT",
      new: { id: "tx-1", amount_cents: 100000 },
    });

    // Verify
    const record = await db.transactions.get("tx-1");
    expect(record).toBeDefined();
  });
});
```

---

## Prevention Tips

1. **Always clean up subscriptions**: Prevent memory leaks in SPAs
2. **Debounce rapid updates**: Batch UI refreshes for performance
3. **Check for duplicates**: Before inserting from realtime events
4. **Handle reconnection**: Implement exponential backoff
5. **Test offline scenarios**: Ensure queue processing works
6. **Monitor connection health**: Periodic health checks
7. **Use filters when possible**: Reduce bandwidth with filtered subscriptions

---

## Debugging Checklist

When realtime sync isn't working:

1. **Check Supabase dashboard**:
   - Realtime enabled?
   - Tables published?
   - RLS policies allow SELECT?

2. **Check browser console**:

   ```javascript
   console.log("Channels:", supabase.getChannels());
   console.log("Status:", useSyncStore.getState().status);
   ```

3. **Verify subscriptions**:

   ```javascript
   const channels = supabase.getChannels();
   channels.forEach((c) => {
     console.log("Channel:", c.topic, "State:", c.state);
   });
   ```

4. **Test manually**:
   - Open two tabs
   - Create record in tab 1
   - Check tab 2 console for "Change on X: INSERT"

5. **Check network**:
   - DevTools → Network → WS tab
   - Look for WebSocket connections
   - Check for errors

---

## Quick Fixes

```javascript
// Force reconnect
await realtimeSync.cleanup();
await realtimeSync.initialize();

// Clear stuck subscriptions
const channels = supabase.getChannels();
for (const channel of channels) {
  await supabase.removeChannel(channel);
}

// Reset sync state
useSyncStore.getState().setStatus("offline");
useSyncStore.getState().setStatus("online");

// Clear and rebuild IndexedDB
await db.delete();
await db.open();
```

---

**Remember**: Realtime sync is network-dependent. Always test offline scenarios and implement graceful degradation.
