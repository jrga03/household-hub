# Checkpoint: Event Compaction

Run these verifications to ensure everything works correctly.

---

## 1. Compaction Triggers by Event Count ✓

### Test 1.1: Create 100+ Events

```javascript
import { db } from "@/lib/dexie";
import { eventCompactor } from "@/lib/event-compactor";
import { nanoid } from "nanoid";

// Create 110 events for same entity
const entityId = "test-compaction-001";

for (let i = 0; i < 110; i++) {
  await db.events.add({
    id: nanoid(),
    entityId,
    entityType: "transaction",
    op: i === 0 ? "create" : "update",
    payload: { amount_cents: 100000 + i * 100 },
    lamportClock: i,
    vectorClock: { "device-1": i },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: `test-${i}`,
    eventVersion: 1,
    checksum: "",
  });
}

// Check trigger
const shouldCompact = await eventCompactor.shouldCompact(entityId);
console.log("Should compact (100+ events):", shouldCompact);
```

**Expected**: `true` (event count threshold reached)

### Test 1.2: Verify Compaction Executes

```javascript
const result = await eventCompactor.compactEntity(entityId);
console.log("Compaction result:", result);
// Expected: { eventsDeleted: 100, snapshotCreated: true }

const remaining = await db.events.where("entityId").equals(entityId).count();
console.log("Events after compaction:", remaining);
// Expected: 11 (1 snapshot + 10 recent events)
```

---

## 2. Compaction Triggers by Time (30 Days) ✓

### Test 2.1: Simulate Old Compaction

```javascript
const entityId = "test-compaction-002";

// Create 20 events (below 100 threshold)
for (let i = 0; i < 20; i++) {
  await db.events.add({
    id: nanoid(),
    entityId,
    entityType: "transaction",
    op: i === 0 ? "create" : "update",
    payload: { amount_cents: 100000 },
    lamportClock: i,
    vectorClock: { "device-1": i },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: `test-${i}`,
    eventVersion: 1,
    checksum: "",
  });
}

// Simulate last compaction 35 days ago
const oldTimestamp = new Date();
oldTimestamp.setDate(oldTimestamp.getDate() - 35);

await db.meta.put({
  key: `compaction:${entityId}`,
  value: {
    timestamp: oldTimestamp.toISOString(),
    eventsDeleted: 0,
    eventsRemaining: 10,
  },
});

// Check trigger
const shouldCompact = await eventCompactor.shouldCompact(entityId);
console.log("Should compact (30+ days):", shouldCompact);
// Expected: true
```

---

## 3. Event Replay Produces Correct State ✓

### Test 3.1: Replay Create → Update Sequence

```javascript
const entityId = "test-replay-001";

await db.events.bulkAdd([
  {
    id: "evt-1",
    entityId,
    entityType: "transaction",
    op: "create",
    payload: { amount_cents: 100000, description: "Initial", category_id: "cat-1" },
    lamportClock: 1,
    vectorClock: { "device-1": 1 },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: "test-1",
    eventVersion: 1,
    checksum: "",
  },
  {
    id: "evt-2",
    entityId,
    entityType: "transaction",
    op: "update",
    payload: { amount_cents: 150000 },
    lamportClock: 2,
    vectorClock: { "device-1": 2 },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: "test-2",
    eventVersion: 1,
    checksum: "",
  },
  {
    id: "evt-3",
    entityId,
    entityType: "transaction",
    op: "update",
    payload: { description: "Updated description" },
    lamportClock: 3,
    vectorClock: { "device-1": 3 },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: "test-3",
    eventVersion: 1,
    checksum: "",
  },
]);

// Access private method via type casting for testing
const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");
const snapshot = (eventCompactor as any).replayEvents(events);

console.log("Replayed state:", snapshot.state);
// Expected: { amount_cents: 150000, description: "Updated description", category_id: "cat-1" }

console.log("Max lamport:", snapshot.lamportClock);
// Expected: 3
```

**Expected**: All fields merged correctly, final state matches last updates

### Test 3.2: Replay with Delete

```javascript
const entityId = "test-replay-002";

await db.events.bulkAdd([
  {
    id: "evt-1",
    entityId,
    entityType: "transaction",
    op: "create",
    payload: { amount_cents: 100000, description: "To be deleted" },
    lamportClock: 1,
    vectorClock: { "device-1": 1 },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: "test-1",
    eventVersion: 1,
    checksum: "",
  },
  {
    id: "evt-2",
    entityId,
    entityType: "transaction",
    op: "delete",
    payload: {},
    lamportClock: 2,
    vectorClock: { "device-1": 2 },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: "test-2",
    eventVersion: 1,
    checksum: "",
  },
]);

const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");
const snapshot = (eventCompactor as any).replayEvents(events);

console.log("Deleted state:", snapshot.state);
// Expected: { deleted: true, deletedAt: <timestamp> }
```

---

## 4. Snapshot Created with Correct Data ✓

### Test 4.1: Snapshot Structure

```javascript
const entityId = "test-snapshot-001";

// Create 110 events
for (let i = 0; i < 110; i++) {
  await db.events.add({
    id: nanoid(),
    entityId,
    entityType: "transaction",
    op: i === 0 ? "create" : "update",
    payload: { amount_cents: 100000 + i, version: i },
    lamportClock: i,
    vectorClock: { "device-1": i },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: `test-${i}`,
    eventVersion: 1,
    checksum: "",
  });
}

// Compact
await eventCompactor.compactEntity(entityId);

// Get snapshot
const snapshot = await db.events.where({ entityId, op: "snapshot" }).first();

console.log("Snapshot:", snapshot);

// Verify snapshot fields
console.log("Snapshot op:", snapshot.op); // "snapshot"
console.log("Snapshot payload:", snapshot.payload); // Final state
console.log("Snapshot lamport:", snapshot.lamportClock); // 109 (max)
console.log("Snapshot deviceId:", snapshot.deviceId); // "system-compactor"
console.log("Snapshot idempotency:", snapshot.idempotencyKey.startsWith("snapshot-")); // true
```

**Expected**:

- `op: "snapshot"`
- `payload` contains final state with `version: 109`
- `lamportClock: 109`
- `deviceId: "system-compactor"`

---

## 5. Old Events Deleted (Safety Buffer Preserved) ✓

### Test 5.1: Verify Deletion Count

```javascript
const entityId = "test-deletion-001";

// Create 150 events
for (let i = 0; i < 150; i++) {
  await db.events.add({
    id: nanoid(),
    entityId,
    entityType: "transaction",
    op: i === 0 ? "create" : "update",
    payload: { sequence: i },
    lamportClock: i,
    vectorClock: { "device-1": i },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: `test-${i}`,
    eventVersion: 1,
    checksum: "",
  });
}

console.log("Before compaction:", await db.events.where("entityId").equals(entityId).count());
// Expected: 150

const result = await eventCompactor.compactEntity(entityId);
console.log("Events deleted:", result.eventsDeleted);
// Expected: 140 (150 - 10 safety buffer)

const remaining = await db.events.where("entityId").equals(entityId).count();
console.log("After compaction:", remaining);
// Expected: 11 (1 snapshot + 10 recent)
```

### Test 5.2: Verify Safety Buffer Preserved

```javascript
const allEvents = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");

// First should be snapshot
console.log("First event op:", allEvents[0].op); // "snapshot"

// Next 10 should be original events with highest lamport clocks
const recentEvents = allEvents.slice(1);
console.log("Recent event count:", recentEvents.length); // 10
console.log(
  "Recent event lamports:",
  recentEvents.map((e) => e.lamportClock)
);
// Expected: [140, 141, 142, 143, 144, 145, 146, 147, 148, 149]
```

---

## 6. Vector Clock Compaction (Inactive Devices Pruned) ✓

### Test 6.1: Prune Inactive Devices

```javascript
// Setup: Register devices
await db.devices?.bulkAdd([
  {
    id: "device-active",
    name: "Active Device",
    household_id: "household-1",
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(), // Active now
  },
  {
    id: "device-inactive",
    name: "Inactive Device",
    household_id: "household-1",
    created_at: new Date().toISOString(),
    last_seen_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), // 40 days ago
  },
]);

const entityId = "test-vector-clock-001";

// Create events with both devices
for (let i = 0; i < 110; i++) {
  await db.events.add({
    id: nanoid(),
    entityId,
    entityType: "transaction",
    op: i === 0 ? "create" : "update",
    payload: { sequence: i },
    lamportClock: i,
    vectorClock: {
      "device-active": Math.floor(i / 2),
      "device-inactive": Math.floor(i / 3),
    },
    timestamp: Date.now(),
    deviceId: i % 2 === 0 ? "device-active" : "device-inactive",
    actorUserId: "user-1",
    idempotencyKey: `test-${i}`,
    eventVersion: 1,
    checksum: "",
  });
}

// Compact
await eventCompactor.compactEntity(entityId);

// Check snapshot vector clock
const snapshot = await db.events.where({ entityId, op: "snapshot" }).first();
console.log("Snapshot vector clock:", snapshot.vectorClock);

// Expected: Only "device-active" remains (device-inactive pruned)
console.log("Has device-active:", "device-active" in snapshot.vectorClock); // true
console.log("Has device-inactive:", "device-inactive" in snapshot.vectorClock); // false (pruned)
```

---

## 7. Compaction Stats Tracked ✓

### Test 7.1: CompactAll Returns Stats

```javascript
// Create events for multiple entities
for (let entityNum = 0; entityNum < 5; entityNum++) {
  const entityId = `test-stats-${entityNum}`;
  for (let i = 0; i < 110; i++) {
    await db.events.add({
      id: nanoid(),
      entityId,
      entityType: "transaction",
      op: i === 0 ? "create" : "update",
      payload: { sequence: i },
      lamportClock: i,
      vectorClock: { "device-1": i },
      timestamp: Date.now(),
      deviceId: "device-1",
      actorUserId: "user-1",
      idempotencyKey: `test-${entityNum}-${i}`,
      eventVersion: 1,
      checksum: "",
    });
  }
}

// Run compaction
const stats = await eventCompactor.compactAll();

console.log("Compaction stats:", stats);
// Expected:
// {
//   entitiesCompacted: 5,
//   eventsDeleted: 500 (5 entities * 100 events each),
//   snapshotsCreated: 5,
//   storageSaved: ~250000 (500 * 500 bytes),
//   duration: <some ms>
// }

console.log("Entities compacted:", stats.entitiesCompacted >= 5);
console.log("Events deleted:", stats.eventsDeleted >= 500);
console.log("Snapshots created:", stats.snapshotsCreated >= 5);
console.log("Duration:", stats.duration > 0);
```

### Test 7.2: Compaction History Recorded

```javascript
const entityId = "test-history-001";

// Create and compact
for (let i = 0; i < 110; i++) {
  await db.events.add({
    id: nanoid(),
    entityId,
    entityType: "transaction",
    op: i === 0 ? "create" : "update",
    payload: { sequence: i },
    lamportClock: i,
    vectorClock: { "device-1": i },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: `test-${i}`,
    eventVersion: 1,
    checksum: "",
  });
}

await eventCompactor.compactEntity(entityId);

// Check history
const history = await eventCompactor.getCompactionHistory(entityId);
console.log("Compaction history:", history);

// Expected:
// {
//   key: "compaction:test-history-001",
//   value: {
//     timestamp: <ISO string>,
//     eventsDeleted: 100,
//     eventsRemaining: 11
//   }
// }

console.log("Has timestamp:", !!history.value.timestamp);
console.log("Events deleted:", history.value.eventsDeleted);
console.log("Events remaining:", history.value.eventsRemaining);
```

---

## 8. Scheduled Compaction Runs ✓

### Test 8.1: Verify Scheduling Logic

```javascript
// Check if scheduled compaction is set up
// (This is manual verification - check console logs or app initialization code)

// In browser console, trigger manual compaction to simulate scheduled run
const stats = await eventCompactor.compactAll();
console.log("Scheduled compaction result:", stats);

// Expected: Compaction runs without errors
```

**Manual Verification**:

1. Check `src/App.tsx` or `src/main.tsx` for scheduled compaction setup
2. Verify `setInterval` or `setTimeout` is configured for daily runs
3. Check console logs for "Running startup compaction..." message on app load

---

## 9. Manual Compaction UI Works ✓

### Test 9.1: Settings Page Integration

**Manual Steps**:

1. Navigate to Settings page
2. Locate "Storage Management" section
3. Click "Compact Event Log" button
4. **Expected**:
   - Button shows "Compacting..." state
   - Toast notification shows success message with stats
   - Stats display updates with latest compaction results

### Test 9.2: Compaction Button State

```javascript
// In Settings page component test
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsPage } from "@/routes/settings";

test("compaction button triggers compaction", async () => {
  render(<SettingsPage />);

  const button = screen.getByText("Compact Event Log");
  fireEvent.click(button);

  // Button should show loading state
  await waitFor(() => {
    expect(screen.getByText("Compacting...")).toBeInTheDocument();
  });

  // After completion, should show success
  await waitFor(() => {
    expect(screen.getByText("Compact Event Log")).toBeInTheDocument();
  });
});
```

---

## 10. Compaction Doesn't Interfere with Sync ✓

### Test 10.1: Sync Active Check

```javascript
import { useSyncStore } from "@/stores/syncStore";

// Set sync status to "syncing"
useSyncStore.getState().setStatus("syncing");

// Try to run compaction
const stats = await eventCompactor.compactAll();

console.log("Compaction during sync:", stats);
// Expected: {
//   entitiesCompacted: 0,
//   eventsDeleted: 0,
//   snapshotsCreated: 0,
//   storageSaved: 0,
//   duration: 0
// }

// Set sync back to idle
useSyncStore.getState().setStatus("online");

// Now compaction should run
const stats2 = await eventCompactor.compactAll();
console.log("Compaction after sync:", stats2.entitiesCompacted > 0);
// Expected: true (compaction runs)
```

### Test 10.2: Snapshot Handled in Sync Flow

```javascript
// Create entity with snapshot
const entityId = "test-sync-001";

for (let i = 0; i < 110; i++) {
  await db.events.add({
    id: nanoid(),
    entityId,
    entityType: "transaction",
    op: i === 0 ? "create" : "update",
    payload: { sequence: i },
    lamportClock: i,
    vectorClock: { "device-1": i },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: `test-${i}`,
    eventVersion: 1,
    checksum: "",
  });
}

await eventCompactor.compactEntity(entityId);

// Fetch events for sync
const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");

console.log("First event is snapshot:", events[0].op === "snapshot"); // true
console.log("Total events:", events.length); // 11

// Verify sync can handle snapshot
// (In conflict resolution, snapshot should be treated as full state)
```

---

## 11. Performance Check ✓

### Test 11.1: Compaction Speed

```javascript
// Create large dataset
const entityId = "test-performance-001";

for (let i = 0; i < 1000; i++) {
  await db.events.add({
    id: nanoid(),
    entityId,
    entityType: "transaction",
    op: i === 0 ? "create" : "update",
    payload: { sequence: i, data: "x".repeat(100) }, // ~100 bytes payload
    lamportClock: i,
    vectorClock: { "device-1": i },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: `test-${i}`,
    eventVersion: 1,
    checksum: "",
  });
}

// Measure compaction time
console.time("compaction-1000-events");
const result = await eventCompactor.compactEntity(entityId);
console.timeEnd("compaction-1000-events");

console.log("Events deleted:", result.eventsDeleted); // 990
console.log("Events remaining:", await db.events.where("entityId").equals(entityId).count()); // 11
```

**Expected**: Compaction completes in <500ms for 1000 events

### Test 11.2: Storage Savings

```javascript
// Measure storage before/after
const beforeCount = await db.events.count();
console.log("Total events before:", beforeCount);

const stats = await eventCompactor.compactAll();

const afterCount = await db.events.count();
console.log("Total events after:", afterCount);

const reduction = beforeCount - afterCount;
console.log("Events removed:", reduction);
console.log("Storage saved estimate:", stats.storageSaved, "bytes");
console.log("Reduction %:", ((reduction / beforeCount) * 100).toFixed(1) + "%");
```

**Expected**: ~90% reduction in event count after compaction

---

## 12. Data Integrity After Compaction ✓

### Test 12.1: State Unchanged

```javascript
const entityId = "test-integrity-001";

// Create sequence of events
const originalPayloads = [];
for (let i = 0; i < 110; i++) {
  const payload = { amount_cents: 100000 + i * 100, description: `Version ${i}` };
  originalPayloads.push(payload);

  await db.events.add({
    id: nanoid(),
    entityId,
    entityType: "transaction",
    op: i === 0 ? "create" : "update",
    payload,
    lamportClock: i,
    vectorClock: { "device-1": i },
    timestamp: Date.now(),
    deviceId: "device-1",
    actorUserId: "user-1",
    idempotencyKey: `test-${i}`,
    eventVersion: 1,
    checksum: "",
  });
}

// Get state before compaction
const eventsBefore = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");
const stateBefore = (eventCompactor as any).replayEvents(eventsBefore);

// Compact
await eventCompactor.compactEntity(entityId);

// Get state after compaction
const eventsAfter = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");
const stateAfter = (eventCompactor as any).replayEvents(eventsAfter);

// Compare
console.log("State before:", stateBefore.state);
console.log("State after:", stateAfter.state);
console.log("States match:", JSON.stringify(stateBefore.state) === JSON.stringify(stateAfter.state));

// Expected: true (state unchanged)
```

### Test 12.2: No Data Loss

```javascript
// Verify final values are correct
console.log("Final amount:", stateAfter.state.amount_cents);
// Expected: 100000 + 109 * 100 = 110900

console.log("Final description:", stateAfter.state.description);
// Expected: "Version 109"

console.log("Final lamport:", stateAfter.lamportClock);
// Expected: 109
```

---

## Success Criteria

All checkpoints must pass:

- [x] Compaction triggers at 100 events
- [x] Compaction triggers after 30 days
- [x] Event replay produces correct state
- [x] Snapshot created with correct data structure
- [x] Old events deleted (safety buffer of 10 preserved)
- [x] Vector clocks compacted (inactive devices pruned)
- [x] Compaction stats tracked and returned
- [x] Scheduled compaction runs automatically
- [x] Manual compaction UI works in Settings
- [x] Compaction doesn't interfere with active sync
- [x] Performance acceptable (<500ms for 1000 events)
- [x] Data integrity maintained (state unchanged after compaction)

---

## Common Issues

### Issue: Compaction not triggering

**Solution**:

1. Check event count: `await db.events.where("entityId").equals(entityId).count()`
2. Verify threshold is 100 (not 1000)
3. Check compaction history: `await eventCompactor.getCompactionHistory(entityId)`

### Issue: Snapshot missing fields

**Solution**:

1. Verify event replay logic in `replayEvents()`
2. Check all event `op` types handled (create, update, delete, snapshot)
3. Ensure field merge uses spread operator: `{ ...state, ...event.payload }`

### Issue: Too many events deleted

**Solution**:

1. Verify `SAFETY_BUFFER` constant is 10
2. Check slice logic: `events.slice(0, -SAFETY_BUFFER)`
3. Ensure snapshot is added before deletion

### Issue: Compaction runs during sync

**Solution**: Add sync status check in `compactAll()`:

```typescript
const syncStatus = useSyncStore.getState().status;
if (syncStatus === "syncing") {
  return {
    /* zero stats */
  };
}
```

---

## Cleanup After Testing

```javascript
// Clear test entities
await db.events.where("entityId").startsWith("test-").delete();

// Clear compaction history
await db.meta.where("key").startsWith("compaction:test-").delete();

console.log("Test data cleaned up");
```

---

## Next Steps

Once all checkpoints pass:

1. Clean up test data
2. Commit event compaction code
3. Document compaction strategy in team wiki
4. Move to **Phase B completion** or next chunk

---

**Estimated Time**: 30-40 minutes to verify all checkpoints
