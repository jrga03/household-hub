# Checkpoint: Conflict Resolution

Run these verifications to ensure everything works correctly.

---

## 1. TypeScript Compilation Passes ✓

```bash
npm run type-check
```

**Expected**: No errors in:

- `src/types/resolution.ts`
- `src/lib/conflict-resolver.ts`
- `src/lib/conflict-resolver.test.ts`

---

## 2. Unit Tests Pass ✓

```bash
npm test src/lib/conflict-resolver.test.ts
```

**Expected Output**:

```
✓ Conflict Resolution (3 tests)
  ✓ should resolve record-level LWW based on lamport clock
  ✓ should use deviceId for tie-breaking
  ✓ should prioritize DELETE over UPDATE

Test Files  1 passed (1)
     Tests  3 passed (3)
```

---

## 3. Record-Level LWW Works ✓

### Test 3.1: Higher Lamport Wins

```javascript
import { ConflictResolutionEngine } from "@/lib/conflict-resolver";

const resolver = new ConflictResolutionEngine();

const local = {
  entityId: "tx-001",
  op: "update",
  lamportClock: 7,
  deviceId: "device-A",
  payload: { amount_cents: 100000 },
};

const remote = {
  entityId: "tx-001",
  op: "update",
  lamportClock: 5,
  deviceId: "device-B",
  payload: { amount_cents: 200000 },
};

const result = await resolver.resolveConflict(local, remote);

console.log("Winner:", result.winner === local ? "local" : "remote");
console.log("Strategy:", result.strategy);
console.log("Reason:", result.reason);
```

**Expected Output**:

```javascript
Winner: local
Strategy: record-lww
Reason: Record-level LWW: local has higher lamport clock
```

### Test 3.2: Remote Wins with Higher Lamport

```javascript
const local = {
  entityId: "tx-002",
  lamportClock: 3,
  deviceId: "device-A",
  payload: { amount_cents: 100000 },
};

const remote = {
  entityId: "tx-002",
  lamportClock: 8,
  deviceId: "device-B",
  payload: { amount_cents: 200000 },
};

const result = await resolver.resolveConflict(local, remote);

console.log("Winner:", result.winner === remote ? "remote" : "local");
console.log("Lamport comparison:", remote.lamportClock > local.lamportClock);
```

**Expected Output**:

```javascript
Winner: remote
Lamport comparison: true
```

---

## 4. Tie-Breaking Works ✓

### Test 4.1: Device ID Lexicographic Comparison

```javascript
const event1 = {
  entityId: "tx-003",
  op: "update",
  lamportClock: 5,
  deviceId: "device-aaa",
  payload: { description: "First" },
};

const event2 = {
  entityId: "tx-003",
  op: "update",
  lamportClock: 5,
  deviceId: "device-zzz",
  payload: { description: "Second" },
};

const result = await resolver.resolveConflict(event1, event2);

console.log("Winner device:", result.winner.deviceId);
console.log("Comparison:", "device-zzz" > "device-aaa");
```

**Expected Output**:

```javascript
Winner device: device-zzz
Comparison: true
```

### Test 4.2: Deterministic Tie-Breaking

```javascript
// Same conflict resolved multiple times
const results = [];
for (let i = 0; i < 10; i++) {
  const result = await resolver.resolveConflict(event1, event2);
  results.push(result.winner.deviceId);
}

const allSame = results.every((id) => id === results[0]);
console.log("Deterministic:", allSame);
console.log("Winner:", results[0]);
```

**Expected**: `Deterministic: true` with consistent winner

---

## 5. DELETE-Wins Logic Works ✓

### Test 5.1: DELETE Beats UPDATE

```javascript
const updateEvent = {
  entityId: "tx-004",
  op: "update",
  lamportClock: 10,
  deviceId: "device-A",
  payload: { amount_cents: 500000 },
};

const deleteEvent = {
  entityId: "tx-004",
  op: "delete",
  lamportClock: 3,
  deviceId: "device-B",
  payload: {},
};

const result = await resolver.resolveConflict(updateEvent, deleteEvent);

console.log("Winner op:", result.winner.op);
console.log("Strategy:", result.strategy);
console.log("UPDATE had higher lamport:", updateEvent.lamportClock > deleteEvent.lamportClock);
```

**Expected Output**:

```javascript
Winner op: delete
Strategy: delete-wins
UPDATE had higher lamport: true
```

### Test 5.2: DELETE vs DELETE (Lamport Wins)

```javascript
const delete1 = {
  entityId: "tx-005",
  op: "delete",
  lamportClock: 7,
  deviceId: "device-A",
  payload: {},
};

const delete2 = {
  entityId: "tx-005",
  op: "delete",
  lamportClock: 4,
  deviceId: "device-B",
  payload: {},
};

const result = await resolver.resolveConflict(delete1, delete2);

console.log("Winner lamport:", result.winner.lamportClock);
console.log("Strategy:", result.strategy);
```

**Expected Output**:

```javascript
Winner lamport: 7
Strategy: delete-wins
```

---

## 6. Resolution Logging Works ✓

### Test 6.1: Log Resolution to IndexedDB

```javascript
import { db } from "@/lib/dexie";
import { logConflict } from "@/lib/conflict-detector";

// Create conflict
const conflict = await logConflict(local, remote);
console.log("Conflict ID:", conflict.id);
console.log("Initial resolution:", conflict.resolution);

// Resolve
const resolution = await resolver.resolveConflict(local, remote);

// Log resolution
await resolver.logResolution(conflict, resolution);

// Verify update
const updated = await db.conflicts.get(conflict.id);
console.log("Updated resolution:", updated.resolution);
console.log("Resolved at:", updated.resolvedAt);
console.log("Resolved value:", updated.resolvedValue);
```

**Expected Output**:

```javascript
Conflict ID: conflict-abc123
Initial resolution: pending
Updated resolution: resolved
Resolved at: 2025-01-15T10:30:00.000Z
Resolved value: { amount_cents: 100000 }
```

### Test 6.2: Verify in DevTools

1. Open DevTools → Application → IndexedDB
2. Find your database → conflicts table
3. Locate conflict by ID
4. **Check**:
   - `resolution` = "resolved"
   - `resolvedAt` is a valid Date
   - `resolvedValue` matches winner payload

---

## 7. Integration with Sync Processor ✓

### Test 7.1: End-to-End Conflict Resolution

```javascript
import { processSyncBatch } from "@/lib/sync-processor";

// Add local event
await db.events.add({
  id: "evt-local-1",
  entityId: "tx-sync-001",
  entityType: "transaction",
  op: "update",
  vectorClock: { "device-A": 5, "device-B": 2 },
  lamportClock: 5,
  payload: { amount_cents: 100000 },
  deviceId: "device-A",
  actorUserId: "user-1",
  timestamp: Date.now(),
  idempotencyKey: "device-A-tx-sync-001-5",
});

// Simulate conflicting remote
const remoteEvents = [
  {
    id: "evt-remote-1",
    entityId: "tx-sync-001",
    entityType: "transaction",
    op: "update",
    vectorClock: { "device-A": 3, "device-B": 4 },
    lamportClock: 4,
    payload: { amount_cents: 200000 },
    deviceId: "device-B",
    actorUserId: "user-1",
    timestamp: Date.now() - 1000,
    idempotencyKey: "device-B-tx-sync-001-4",
  },
];

// Process sync
await processSyncBatch(remoteEvents);

// Verify resolution
const conflicts = await db.conflicts.where("entityId").equals("tx-sync-001").toArray();

console.log("Conflicts found:", conflicts.length);
console.log("Resolution status:", conflicts[0]?.resolution);
console.log("Winner payload:", conflicts[0]?.resolvedValue);
```

**Expected**:

- Conflict detected and logged
- Automatically resolved (local wins, higher lamport)
- Resolution = "resolved"
- Winner payload applied

**Console Output**:

```
Conflict detected: tx-sync-001
Conflict resolved: { entityId: 'tx-sync-001', strategy: 'record-lww', winner: 'local' }
Conflicts found: 1
Resolution status: resolved
Winner payload: { amount_cents: 100000 }
```

---

## 8. Deterministic Property ✓

### Test 8.1: Same Input → Same Output

```javascript
const local = {
  entityId: "tx-det-001",
  op: "update",
  lamportClock: 5,
  deviceId: "device-A",
  payload: { amount_cents: 100000 },
};

const remote = {
  entityId: "tx-det-001",
  op: "update",
  lamportClock: 3,
  deviceId: "device-B",
  payload: { amount_cents: 200000 },
};

// Run resolution 100 times
const results = [];
for (let i = 0; i < 100; i++) {
  const result = await resolver.resolveConflict(local, remote);
  results.push({
    winnerDevice: result.winner.deviceId,
    strategy: result.strategy,
  });
}

// Check all identical
const allSame = results.every(
  (r) => r.winnerDevice === results[0].winnerDevice && r.strategy === results[0].strategy
);

console.log("Deterministic:", allSame);
console.log("Iterations:", results.length);
console.log("Winner:", results[0].winnerDevice);
```

**Expected**: `Deterministic: true` for all 100 iterations

---

## 9. Commutative Property ✓

### Test 9.1: resolve(A, B) = resolve(B, A)

```javascript
// Resolve in both orders
const resultAB = await resolver.resolveConflict(local, remote);
const resultBA = await resolver.resolveConflict(remote, local);

// Compare winners
const sameWinner = resultAB.winner.deviceId === resultBA.winner.deviceId;
const sameStrategy = resultAB.strategy === resultBA.strategy;

console.log("Commutative:", sameWinner && sameStrategy);
console.log("A→B winner:", resultAB.winner.deviceId);
console.log("B→A winner:", resultBA.winner.deviceId);
```

**Expected**: `Commutative: true` with identical winners

---

## 10. Performance Check ✓

### Test 10.1: Resolution Speed

```javascript
const local = {
  entityId: "tx-perf-001",
  op: "update",
  lamportClock: 5,
  deviceId: "device-A",
  payload: { amount_cents: 100000 },
};

const remote = {
  entityId: "tx-perf-001",
  op: "update",
  lamportClock: 3,
  deviceId: "device-B",
  payload: { amount_cents: 200000 },
};

console.time("resolution-batch");
for (let i = 0; i < 1000; i++) {
  await resolver.resolveConflict(local, remote);
}
console.timeEnd("resolution-batch");
```

**Expected**: < 10ms for 1000 resolutions (< 0.01ms per resolution)

### Test 10.2: Batch Resolution

```javascript
// Create 100 conflicts
const conflicts = Array.from({ length: 100 }, (_, i) => ({
  id: `conflict-${i}`,
  entityId: `tx-${i}`,
  localEvent: {
    entityId: `tx-${i}`,
    op: "update",
    lamportClock: 5,
    deviceId: "device-A",
    payload: { amount_cents: 100000 + i },
  },
  remoteEvent: {
    entityId: `tx-${i}`,
    op: "update",
    lamportClock: 3,
    deviceId: "device-B",
    payload: { amount_cents: 200000 + i },
  },
  resolution: "pending",
  detectedAt: new Date(),
}));

// Resolve all in parallel
console.time("batch-resolution");
const resolutions = await Promise.all(
  conflicts.map((c) => resolver.resolveConflict(c.localEvent, c.remoteEvent))
);
console.timeEnd("batch-resolution");

console.log("Resolved:", resolutions.length);
```

**Expected**: < 50ms for 100 conflicts in parallel

---

## 11. Edge Cases Handled ✓

### Test 11.1: Same Event (No Conflict)

```javascript
const event = {
  entityId: "tx-edge-001",
  op: "update",
  lamportClock: 5,
  deviceId: "device-A",
  payload: { amount_cents: 100000 },
};

const result = await resolver.resolveConflict(event, event);

console.log("Winner:", result.winner === event ? "same event" : "different");
console.log("Strategy:", result.strategy);
```

**Expected**: Resolves without error (winner is the same event)

### Test 11.2: Missing Payload Fields

```javascript
const sparse1 = {
  entityId: "tx-edge-002",
  op: "update",
  lamportClock: 5,
  deviceId: "device-A",
  payload: { amount_cents: 100000 },
};

const sparse2 = {
  entityId: "tx-edge-002",
  op: "update",
  lamportClock: 3,
  deviceId: "device-B",
  payload: { description: "Updated" }, // Different fields
};

const result = await resolver.resolveConflict(sparse1, sparse2);

console.log("Winner payload:", result.winner.payload);
console.log("Loser payload:", result.loser.payload);
```

**Expected**: Resolves correctly, entire winner payload used

---

## 12. Data Integrity ✓

### Test 12.1: Resolution Record Structure

```javascript
const resolution = await resolver.resolveConflict(local, remote);

const hasRequiredFields =
  "winner" in resolution &&
  "loser" in resolution &&
  "strategy" in resolution &&
  "reason" in resolution;

console.log("Valid structure:", hasRequiredFields);
console.log("Strategy type:", typeof resolution.strategy);
console.log("Has reason:", resolution.reason.length > 0);
```

**Expected**: `Valid structure: true` with all required fields

### Test 12.2: Logged Resolution Validity

```javascript
const conflicts = await db.conflicts.where("resolution").equals("resolved").toArray();

const validResolutions = conflicts.every(
  (c) => c.resolvedAt instanceof Date && c.resolvedValue !== undefined
);

console.log("All resolutions valid:", validResolutions);
console.log("Sample resolution:", conflicts[0]);
```

**Expected**: All resolved conflicts have valid timestamps and values

---

## Success Criteria

All checkpoints must pass:

- [ ] TypeScript compilation passes
- [ ] Unit tests pass (3/3)
- [ ] Record-level LWW works correctly
- [ ] Tie-breaking with device ID works
- [ ] DELETE-wins logic functional
- [ ] Resolution logging to IndexedDB works
- [ ] Integration with sync processor working
- [ ] Resolution is deterministic
- [ ] Resolution is commutative
- [ ] Performance acceptable (<0.01ms per resolution)
- [ ] Edge cases handled gracefully
- [ ] Data integrity maintained

---

## Common Issues

### Issue: Wrong version wins

**Solution**: Verify lamport clock comparison uses correct operator (>)

### Issue: DELETE doesn't win

**Solution**: Check DELETE detection happens before LWW logic

### Issue: Resolutions not persisted

**Solution**: Ensure logResolution() updates conflict record in IndexedDB

### Issue: Tie-breaking non-deterministic

**Solution**: Verify deviceId comparison is lexicographic string comparison

---

## Cleanup After Testing

```javascript
// Clear test resolutions
await db.conflicts.where("entityId").startsWith("tx-test-").delete();

// Reset test events
await db.events.where("entityId").startsWith("tx-test-").delete();

console.log("Test data cleaned up");
```

---

## Next Steps

Once all checkpoints pass:

1. Clean up test data
2. Commit conflict resolution code
3. Move to **Chunk 034: Sync Realtime**

---

**Estimated Time**: 20-30 minutes to verify all checkpoints
