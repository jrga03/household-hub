# Troubleshooting: Event Compaction

Common issues and solutions when implementing event compaction.

---

## Compaction Trigger Issues

### Problem: Compaction doesn't trigger at 100 events

**Symptoms**:

- Entity has 150 events
- `shouldCompact()` returns `false`
- Manual compaction needed

**Cause**: Event count query not filtering by entityId correctly

**Solution**: Verify entity-specific count:

```typescript
// Check actual count
const count = await db.events.where("entityId").equals(entityId).count();
console.log("Event count:", count);

// If count is correct but still doesn't trigger:
// 1. Check COMPACTION_THRESHOLD constant (should be 100, not 1000)
const threshold = eventCompactor.COMPACTION_THRESHOLD;
console.log("Threshold:", threshold); // Should be 100

// 2. Verify shouldCompact logic
const shouldCompact = await eventCompactor.shouldCompact(entityId);
console.log("Should compact:", shouldCompact);
```

---

### Problem: Time-based compaction not triggering after 30 days

**Symptoms**:

- Last compaction was 35 days ago
- Only 50 events (below 100 threshold)
- Still doesn't trigger

**Cause**: Compaction history not recorded or timestamp comparison issue

**Solution**: Check compaction history:

```typescript
// Verify history exists
const history = await db.meta.get(`compaction:${entityId}`);
console.log("Last compaction:", history);

// If missing, compaction never ran - should trigger on first run
// If exists, check timestamp calculation:
const lastTime = new Date(history.value.timestamp).getTime();
const now = Date.now();
const daysSince = (now - lastTime) / (1000 * 60 * 60 * 24);
console.log("Days since last compaction:", daysSince);
// Should be >30 to trigger
```

---

### Problem: Compaction triggers too frequently

**Symptoms**:

- Compaction runs every hour instead of daily
- Performance degradation

**Cause**: Scheduled interval too short or triggering on every event

**Solution**: Review scheduling logic:

```typescript
// Check interval configuration
// Should be 24 hours (86400000ms), not 1 hour (3600000ms)
setInterval(
  () => {
    eventCompactor.compactAll();
  },
  24 * 60 * 60 * 1000
); // 24 hours, not 1000 (1 second)

// Also ensure compaction isn't called on every mutation
// It should ONLY be called:
// - On scheduled interval
// - On manual trigger
// - On app startup (once)
```

---

## Event Replay Issues

### Problem: Snapshot missing fields after replay

**Symptoms**:

- Original transaction has `amount_cents`, `description`, `category_id`
- Snapshot only has `amount_cents`
- Other fields lost

**Cause**: Event replay not merging fields correctly

**Solution**: Fix replay logic to merge, not replace:

```typescript
// WRONG:
case "update":
  state = event.payload; // Replaces entire state!
  break;

// CORRECT:
case "update":
  state = { ...state, ...event.payload }; // Merges fields
  break;
```

Verify:

```typescript
const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");
const snapshot = (eventCompactor as any).replayEvents(events);
console.log("Final state:", snapshot.state);
// Should have ALL fields from original create + all updates
```

---

### Problem: Delete events not handled correctly

**Symptoms**:

- Entity deleted
- Snapshot still shows full record
- `deleted: true` flag missing

**Cause**: Delete operation not setting tombstone

**Solution**: Ensure delete creates tombstone:

```typescript
case "delete":
  state = {
    ...state, // Keep existing fields for audit
    deleted: true,
    deletedAt: event.timestamp,
  };
  break;
```

---

### Problem: Vector clock merge produces wrong result

**Symptoms**:

- Device A has clock: {device-A: 5}
- Device B has clock: {device-B: 3}
- Merged clock: {device-B: 3} (device-A missing!)

**Cause**: Not using proper merge function

**Solution**: Use `mergeVectorClocks` utility:

```typescript
import { mergeVectorClocks } from "./vector-clock";

// In replayEvents:
for (const event of events) {
  vectorClock = mergeVectorClocks(vectorClock, event.vectorClock);
}

// mergeVectorClocks should take MAX of each device:
// {device-A: 5} + {device-B: 3} = {device-A: 5, device-B: 3}
```

---

## Snapshot Creation Issues

### Problem: Snapshot not created (but events deleted!)

**Symptoms**:

- Compaction runs
- Old events deleted
- No snapshot event found
- DATA LOSS

**Cause**: Snapshot creation failed but deletion proceeded

**Solution**: CRITICAL - Always create snapshot BEFORE deletion:

```typescript
// CORRECT ORDER:
await db.events.add(snapshotEvent); // 1. Create snapshot first
await db.events.bulkDelete(eventsToDelete.map((e) => e.id)); // 2. Then delete

// Add error handling:
try {
  await db.events.add(snapshotEvent);
} catch (err) {
  console.error("Snapshot creation failed - aborting compaction");
  return { eventsDeleted: 0, snapshotCreated: false };
}

// Only proceed with deletion if snapshot succeeded
await db.events.bulkDelete(eventsToDelete.map((e) => e.id));
```

---

### Problem: Snapshot has wrong lamport clock

**Symptoms**:

- 110 events with lamport 0-109
- Snapshot lamport: 50 (should be 109!)

**Cause**: Not taking max lamport from all events

**Solution**: Use `Math.max` in replay:

```typescript
for (const event of events) {
  maxLamport = Math.max(maxLamport, event.lamportClock);
}

// Snapshot should have highest lamport:
const snapshotEvent = {
  // ...
  lamportClock: maxLamport, // Not events.length!
};
```

---

### Problem: Snapshot deviceId conflicts with real device

**Symptoms**:

- Snapshot `deviceId: "device-1"`
- Confuses conflict detection logic

**Cause**: Using real deviceId instead of system ID

**Solution**: Use special system deviceId:

```typescript
const snapshotEvent = {
  // ...
  deviceId: "system-compactor", // NOT a real device ID
  // or
  deviceId: "snapshot",
};

// In conflict resolution, handle snapshots specially:
if (event.op === "snapshot") {
  // Snapshot is authoritative for its lamport clock
  return event.payload;
}
```

---

## Storage & Deletion Issues

### Problem: Too many events deleted (more than intended)

**Symptoms**:

- 150 events before compaction
- Expected: 11 after (1 snapshot + 10 recent)
- Actual: 1 after (only snapshot!)

**Cause**: Safety buffer slice logic incorrect

**Solution**: Fix slice to keep last N:

```typescript
// WRONG:
const eventsToDelete = events.slice(-10); // Gets LAST 10 (keeps first 140!)

// CORRECT:
const eventsToDelete = events.slice(0, -10); // Deletes first 140, keeps last 10
```

Verify:

```typescript
const events = [1, 2, 3, 4, 5];
const toDelete = events.slice(0, -2); // [1, 2, 3]
const toKeep = events.slice(-2); // [4, 5]
```

---

### Problem: Safety buffer not preserved

**Symptoms**:

- After compaction: only snapshot exists
- No recent events for conflict resolution

**Cause**: `SAFETY_BUFFER` constant set to 0 or deletion logic wrong

**Solution**: Ensure buffer is preserved:

```typescript
private readonly SAFETY_BUFFER = 10; // NOT 0

// Verify deletion count:
const result = await eventCompactor.compactEntity(entityId);
console.log("Events deleted:", result.eventsDeleted);
// Should be: totalEvents - SAFETY_BUFFER - 1 (for snapshot)

const remaining = await db.events.where("entityId").equals(entityId).count();
console.log("Remaining:", remaining);
// Should be: SAFETY_BUFFER + 1
```

---

### Problem: IndexedDB quota exceeded during compaction

**Symptoms**:

- Compaction starts
- Error: "QuotaExceededError"
- Compaction fails partway through

**Cause**: Adding snapshot before deleting old events temporarily doubles storage

**Solution**: Compact in batches or check quota first:

```typescript
// Check available quota before compaction:
const estimate = await navigator.storage.estimate();
const available = estimate.quota - estimate.usage;
const needed = 1000000; // 1MB safety margin

if (available < needed) {
  console.warn("Low storage - skipping compaction");
  return { eventsDeleted: 0, snapshotCreated: false };
}

// Or compact in smaller batches:
const batchSize = 50;
for (let i = 0; i < eventsToDelete.length; i += batchSize) {
  const batch = eventsToDelete.slice(i, i + batchSize);
  await db.events.bulkDelete(batch.map((e) => e.id));
}
```

---

## Vector Clock Compaction Issues

### Problem: All devices pruned from vector clock

**Symptoms**:

- Snapshot vector clock: `{}`
- Should have active devices

**Cause**: Device activity threshold too strict or no device registry

**Solution**: Check device last_seen tracking:

```typescript
// Verify devices table has recent activity:
const devices = await db.devices?.toArray();
console.log("Devices:", devices.map(d => ({
  id: d.id,
  last_seen: d.last_seen_at,
  inactive: Date.now() - new Date(d.last_seen_at).getTime() > 30 * 24 * 60 * 60 * 1000
})));

// If no devices table, skip pruning:
private compactVectorClock(vectorClock: VectorClock): VectorClock {
  if (!db.devices) {
    return vectorClock; // Keep all devices
  }
  // ... pruning logic
}
```

---

### Problem: Active device incorrectly pruned

**Symptoms**:

- Device used yesterday
- Pruned from vector clock

**Cause**: `last_seen_at` not updated, or comparison logic wrong

**Solution**: Ensure devices update last_seen:

```typescript
// On every mutation, update device:
await db.devices?.update(deviceId, {
  last_seen_at: new Date().toISOString(),
});

// Verify threshold calculation:
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const inactiveDuration = now - lastSeen;
console.log("Inactive for (days):", inactiveDuration / (24 * 60 * 60 * 1000));

if (inactiveDuration < THIRTY_DAYS) {
  // Keep device
}
```

---

## Performance Issues

### Problem: Compaction takes >10 seconds

**Symptoms**:

- Compacting 1000 events
- Takes 15+ seconds
- UI freezes

**Cause**: Synchronous operations blocking main thread

**Solution**: Use batching and async operations:

```typescript
// Batch event replay (process in chunks):
const CHUNK_SIZE = 100;
for (let i = 0; i < events.length; i += CHUNK_SIZE) {
  const chunk = events.slice(i, i + CHUNK_SIZE);
  for (const event of chunk) {
    // Process event
  }
  // Yield to event loop
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Or use Web Worker for compaction (non-blocking):
// src/workers/compaction.worker.ts
self.onmessage = async (e) => {
  const { events } = e.data;
  const snapshot = replayEvents(events);
  self.postMessage(snapshot);
};
```

---

### Problem: Compaction causes UI lag

**Symptoms**:

- Scheduled compaction runs
- UI becomes unresponsive for 2-3 seconds

**Cause**: Running on main thread during user interaction

**Solution**: Defer compaction during active use:

```typescript
// Check if user is active:
let lastUserActivity = Date.now();

document.addEventListener("mousemove", () => {
  lastUserActivity = Date.now();
});

// In compaction scheduler:
const timeSinceActivity = Date.now() - lastUserActivity;
if (timeSinceActivity < 60000) {
  console.log("User active - deferring compaction");
  return;
}

// Or use requestIdleCallback:
requestIdleCallback(
  async () => {
    await eventCompactor.compactAll();
  },
  { timeout: 5000 }
);
```

---

## Scheduled Compaction Issues

### Problem: Scheduled compaction not running

**Symptoms**:

- App open for days
- No compaction in logs
- Event count keeps growing

**Cause**: Interval not set or cleared on unmount

**Solution**: Verify scheduling setup:

```typescript
// Check in App.tsx:
useEffect(() => {
  // Schedule compaction
  const intervalId = setInterval(
    () => {
      eventCompactor.compactAll();
    },
    24 * 60 * 60 * 1000
  );

  return () => {
    clearInterval(intervalId); // Cleanup on unmount
  };
}, []);

// Verify it's running:
console.log("Compaction interval set");
```

---

### Problem: Multiple compaction intervals running

**Symptoms**:

- Compaction runs multiple times simultaneously
- Console shows duplicate "Compaction complete" logs

**Cause**: App component mounted multiple times without cleanup

**Solution**: Use singleton pattern:

```typescript
// Create global flag:
let compactionScheduled = false;

// In App.tsx:
useEffect(() => {
  if (compactionScheduled) {
    console.log("Compaction already scheduled");
    return;
  }

  compactionScheduled = true;
  const intervalId = setInterval(
    () => {
      eventCompactor.compactAll();
    },
    24 * 60 * 60 * 1000
  );

  return () => {
    clearInterval(intervalId);
    compactionScheduled = false;
  };
}, []);
```

---

## Integration Issues

### Problem: Compaction runs during active sync

**Symptoms**:

- Sync in progress
- Compaction deletes events mid-sync
- Sync fails with "event not found"

**Cause**: No sync status check before compaction

**Solution**: Add sync guard:

```typescript
async compactAll(): Promise<CompactionStats> {
  // Check sync status
  const syncStatus = useSyncStore.getState().status;
  if (syncStatus === "syncing") {
    console.log("Sync in progress - deferring compaction");
    return {
      entitiesCompacted: 0,
      eventsDeleted: 0,
      snapshotsCreated: 0,
      storageSaved: 0,
      duration: 0,
    };
  }

  // Proceed with compaction
  // ...
}
```

---

### Problem: Conflict resolution fails after compaction

**Symptoms**:

- Conflict detected
- Resolution attempts to replay events
- Error: "Cannot read property 'op' of undefined"

**Cause**: Conflict resolution not handling snapshot events

**Solution**: Update conflict resolution to handle snapshots:

```typescript
export function replayForConflictResolution(events: TransactionEvent[]): any {
  let state = {};

  for (const event of events) {
    if (event.op === "snapshot") {
      // Snapshot is complete state, not incremental
      state = { ...event.payload };
    } else if (event.op === "create") {
      state = { ...event.payload };
    } else if (event.op === "update") {
      state = { ...state, ...event.payload };
    } else if (event.op === "delete") {
      state = { ...state, deleted: true, deletedAt: event.timestamp };
    }
  }

  return state;
}
```

---

## Data Integrity Issues

### Problem: State changes after compaction

**Symptoms**:

- Transaction amount before compaction: ₱1,500
- After compaction: ₱1,000
- Data corruption!

**Cause**: Event replay applying events in wrong order or skipping events

**Solution**: Verify events sorted by lamport clock:

```typescript
const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock"); // CRITICAL: Must sort!

// Test replay:
const stateBefore = replayEvents(events);
await compactEntity(entityId);
const eventsAfter = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");
const stateAfter = replayEvents(eventsAfter);

console.log(
  "States match:",
  JSON.stringify(stateBefore.state) === JSON.stringify(stateAfter.state)
);
// MUST be true
```

---

### Problem: Compaction creates duplicate snapshots

**Symptoms**:

- Entity has 2+ snapshot events
- Confusion about which is authoritative

**Cause**: Compaction running multiple times or not checking for existing snapshot

**Solution**: Delete old snapshots before creating new one:

```typescript
async compactEntity(entityId: string): Promise<void> {
  // Remove old snapshots first
  const oldSnapshots = await db.events
    .where({ entityId, op: "snapshot" })
    .toArray();

  if (oldSnapshots.length > 0) {
    await db.events.bulkDelete(oldSnapshots.map(s => s.id));
    console.log(`Removed ${oldSnapshots.length} old snapshots`);
  }

  // Create new snapshot
  // ...
}
```

---

## Testing Issues

### Problem: Unit tests fail with "db is not defined"

**Symptoms**:

- Test imports `eventCompactor`
- Error: "Cannot read property 'events' of undefined"

**Cause**: Dexie database not initialized in test environment

**Solution**: Set up database in test beforeEach:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./dexie";
import { eventCompactor } from "./event-compactor";

describe("EventCompactor", () => {
  beforeEach(async () => {
    // Clean and reopen database
    await db.delete();
    await db.open();
  });

  it("should compact entity", async () => {
    // Test code
  });
});
```

---

### Problem: Private methods can't be tested

**Symptoms**:

- Need to test `replayEvents()` function
- It's private - no access from tests

**Cause**: TypeScript access modifiers

**Solution**: Use type casting for testing:

```typescript
// In test:
const snapshot = (eventCompactor as any).replayEvents(events);

// Or export a test-only version:
// In event-compactor.ts:
export function __testOnly_replayEvents(events: TransactionEvent[]) {
  return new EventCompactor().replayEvents(events);
}

// Only use in tests, not production code
```

---

### Problem: Mock data doesn't trigger compaction

**Symptoms**:

- Test creates 110 events
- `shouldCompact()` returns false

**Cause**: Events not associated with same entityId

**Solution**: Ensure consistent entityId:

```typescript
const entityId = "test-entity-001"; // Fixed ID

for (let i = 0; i < 110; i++) {
  await db.events.add({
    id: nanoid(),
    entityId, // Same for all events
    // ...
  });
}

// Verify:
const count = await db.events.where("entityId").equals(entityId).count();
console.log("Events for entity:", count); // Should be 110
```

---

## Browser Compatibility Issues

### Problem: Safari private mode throws QuotaExceededError

**Symptoms**:

- Works in normal Safari
- Private mode: Compaction fails immediately

**Cause**: Safari private mode has strict IndexedDB quotas

**Solution**: Detect and handle gracefully:

```typescript
async compactAll(): Promise<CompactionStats> {
  try {
    // Check quota
    const estimate = await navigator.storage.estimate();

    if (!estimate.quota) {
      console.warn("Storage API not available (private mode?)");
      return { /* zero stats */ };
    }

    // Proceed with compaction
    // ...
  } catch (err) {
    if (err.name === "QuotaExceededError") {
      console.error("Storage quota exceeded - cannot compact");
      return { /* zero stats */ };
    }
    throw err;
  }
}
```

---

### Problem: Firefox doesn't update `last_seen_at`

**Symptoms**:

- Chrome: Devices update correctly
- Firefox: All devices show old last_seen

**Cause**: Firefox IndexedDB update timing issue

**Solution**: Use explicit update with await:

```typescript
// Ensure update completes:
await db.transaction("rw", db.devices, async () => {
  await db.devices.update(deviceId, {
    last_seen_at: new Date().toISOString(),
  });
});

// Verify update:
const device = await db.devices.get(deviceId);
console.log("Updated last_seen:", device.last_seen_at);
```

---

## Common Debugging Steps

### Step 1: Verify Event Count

```typescript
const entityId = "problematic-entity";
const count = await db.events.where("entityId").equals(entityId).count();
console.log("Event count:", count);

const shouldCompact = await eventCompactor.shouldCompact(entityId);
console.log("Should compact:", shouldCompact);
```

### Step 2: Check Compaction History

```typescript
const history = await eventCompactor.getCompactionHistory(entityId);
console.log("Last compaction:", history);

const allHistory = await eventCompactor.getAllCompactionHistory();
console.log("All compaction history:", allHistory.length, "entities");
```

### Step 3: Test Replay Manually

```typescript
const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");
console.log("Events:", events.length);

const snapshot = (eventCompactor as any).replayEvents(events);
console.log("Replayed state:", snapshot.state);
console.log("Max lamport:", snapshot.lamportClock);
```

### Step 4: Run Single Entity Compaction

```typescript
try {
  const result = await eventCompactor.compactEntity(entityId);
  console.log("Compaction result:", result);
} catch (err) {
  console.error("Compaction failed:", err);
}
```

### Step 5: Verify Snapshot Created

```typescript
const snapshot = await db.events.where({ entityId, op: "snapshot" }).first();
console.log("Snapshot exists:", !!snapshot);
if (snapshot) {
  console.log("Snapshot lamport:", snapshot.lamportClock);
  console.log("Snapshot payload:", snapshot.payload);
}
```

---

## Prevention Tips

1. **Always create snapshot before deletion**: Prevents data loss
2. **Sort events by lamportClock**: Ensures correct replay order
3. **Merge fields in replay**: Use spread operator, not replacement
4. **Check sync status before compaction**: Avoid race conditions
5. **Test with realistic data**: Use 1000+ events in tests
6. **Handle snapshots in all replay logic**: Update conflict resolution, sync
7. **Monitor compaction stats**: Track events deleted, storage saved
8. **Defer during user activity**: Use idle callbacks
9. **Preserve safety buffer**: Always keep last 10 events
10. **Guard against quota errors**: Check storage before compacting

---

## Quick Fixes Reference

```javascript
// Force compaction for entity
await eventCompactor.compactEntity("entity-id");

// Check if compaction needed
const needed = await eventCompactor.shouldCompact("entity-id");

// View compaction history
const history = await eventCompactor.getAllCompactionHistory();

// Manually create snapshot (testing only)
const events = await db.events.where("entityId").equals("entity-id").sortBy("lamportClock");
const snapshot = (eventCompactor as any).replayEvents(events);
console.log("Manual snapshot:", snapshot);

// Clear all compaction history (reset)
await db.meta.where("key").startsWith("compaction:").delete();

// Run full compaction with stats
const stats = await eventCompactor.compactAll();
console.log("Stats:", stats);
```

---

**Remember**: Event compaction is critical for long-term stability. Always test thoroughly with realistic data volumes and verify state integrity after compaction.
