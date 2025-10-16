# Checkpoint: Conflict Detection

Run these verifications to ensure everything works correctly.

---

## 1. TypeScript Compilation Passes ✓

```bash
npm run type-check
```

**Expected**: No errors in:

- `src/types/sync.ts`
- `src/lib/conflict-detector.ts`
- `src/stores/conflictStore.ts`
- `src/components/ConflictIndicator.tsx` (if created)

---

## 2. Unit Tests Pass ✓

```bash
npm test src/lib/conflict-detector.test.ts
```

**Expected Output**:

```
✓ Conflict Detection (3 tests)
  ✓ should detect concurrent edits
  ✓ should not detect conflict for sequential edits
  ✓ should not detect conflict for different entities

Test Files  1 passed (1)
     Tests  3 passed (3)
```

All tests should pass with no failures.

---

## 3. Conflict Detection Logic Works ✓

Test in browser console:

### Test 3.1: Concurrent Edits (Conflict)

```javascript
import { detectConflict } from "@/lib/conflict-detector";

const localEvent = {
  entityId: "tx-test-001",
  entityType: "transaction",
  vectorClock: { "device-A": 5, "device-B": 2 },
  lamportClock: 5,
};

const remoteEvent = {
  entityId: "tx-test-001",
  entityType: "transaction",
  vectorClock: { "device-A": 3, "device-B": 4 },
  lamportClock: 4,
};

const result = detectConflict(localEvent, remoteEvent);
console.log(result);
```

**Expected Output**:

```javascript
{
  hasConflict: true,
  reason: "Concurrent edits detected",
  comparison: "concurrent"
}
```

### Test 3.2: Sequential Edits (No Conflict)

```javascript
const sequential1 = {
  entityId: "tx-test-002",
  vectorClock: { "device-A": 3, "device-B": 2 },
};

const sequential2 = {
  entityId: "tx-test-002",
  vectorClock: { "device-A": 5, "device-B": 3 },
};

const result = detectConflict(sequential1, sequential2);
console.log(result);
```

**Expected Output**:

```javascript
{
  hasConflict: false,
  comparison: "remote-ahead"
}
```

### Test 3.3: Different Entities (No Conflict)

```javascript
const entity1 = { entityId: "tx-A", vectorClock: { "device-A": 5 } };
const entity2 = { entityId: "tx-B", vectorClock: { "device-A": 3 } };

const result = detectConflict(entity1, entity2);
console.log(result);
```

**Expected Output**:

```javascript
{
  hasConflict: false,
  reason: "Different entities"
}
```

---

## 4. Conflict Logging Works ✓

### Test 4.1: Log Conflict to IndexedDB

```javascript
import { logConflict } from "@/lib/conflict-detector";
import { db } from "@/lib/dexie";

const localEvent = {
  id: "evt-local-1",
  entityId: "tx-test-003",
  entityType: "transaction",
  op: "update",
  vectorClock: { "device-A": 5, "device-B": 2 },
  lamportClock: 5,
  payload: { amount_cents: 150000 },
  deviceId: "device-A",
  actorUserId: "user-1",
  timestamp: Date.now(),
  idempotencyKey: "device-A-transaction-tx-test-003-5",
};

const remoteEvent = {
  id: "evt-remote-1",
  entityId: "tx-test-003",
  entityType: "transaction",
  op: "update",
  vectorClock: { "device-A": 3, "device-B": 4 },
  lamportClock: 4,
  payload: { amount_cents: 200000 },
  deviceId: "device-B",
  actorUserId: "user-1",
  timestamp: Date.now() - 1000,
  idempotencyKey: "device-B-transaction-tx-test-003-4",
};

await logConflict(localEvent, remoteEvent);
console.log("Conflict logged");
```

### Test 4.2: Verify in IndexedDB

```javascript
const conflicts = await db.conflicts.toArray();
console.log("Total conflicts:", conflicts.length);
console.log("Latest conflict:", conflicts[conflicts.length - 1]);
```

**Expected Output**:

```javascript
Total conflicts: 1
Latest conflict: {
  id: "...",
  entityType: "transaction",
  entityId: "tx-test-003",
  detectedAt: Date(...),
  localEvent: { ... },
  remoteEvent: { ... },
  resolution: "pending",
  resolvedValue: undefined,
  resolvedAt: undefined
}
```

**Visual Check in DevTools**:

1. Open DevTools → Application → IndexedDB
2. Find your database → conflicts table
3. Verify conflict entries exist with correct structure

---

## 5. Conflict Store Updates ✓

### Test 5.1: Check Pending Count

```javascript
import { useConflictStore } from "@/stores/conflictStore";

const count = useConflictStore.getState().getPendingCount();
console.log("Pending conflicts:", count);
```

**Expected**: `count >= 1` (from previous tests)

### Test 5.2: Check Conflicts Array

```javascript
const conflicts = useConflictStore.getState().conflicts;
console.log("Conflicts in store:", conflicts);
```

**Expected**: Array with conflict objects

### Test 5.3: Add Conflict Manually

```javascript
useConflictStore.getState().addConflict({
  id: "manual-conflict-1",
  entityType: "transaction",
  entityId: "tx-manual-001",
  detectedAt: new Date(),
  localEvent: {
    /* ... */
  },
  remoteEvent: {
    /* ... */
  },
  resolution: "pending",
});

const newCount = useConflictStore.getState().getPendingCount();
console.log("New count:", newCount);
```

**Expected**: Count increased by 1

### Test 5.4: Remove Conflict

```javascript
const firstConflictId = useConflictStore.getState().conflicts[0]?.id;
useConflictStore.getState().removeConflict(firstConflictId);

const afterRemoval = useConflictStore.getState().getPendingCount();
console.log("After removal:", afterRemoval);
```

**Expected**: Count decreased by 1

---

## 6. Integration with Sync Processor ✓

### Test 6.1: Verify Import

Check that `src/lib/sync-processor.ts` imports conflict detection:

```typescript
import { detectConflict, logConflict } from "./conflict-detector";
```

### Test 6.2: Simulate Sync with Conflict

```javascript
import { processSyncBatch } from "@/lib/sync-processor";
import { db } from "@/lib/dexie";

// Add local event
await db.events.add({
  id: "evt-local-sync-1",
  entityId: "tx-sync-001",
  entityType: "transaction",
  op: "update",
  vectorClock: { "device-A": 5, "device-B": 2 },
  lamportClock: 5,
  payload: { amount_cents: 150000 },
  deviceId: "device-A",
  actorUserId: "user-1",
  timestamp: Date.now(),
  idempotencyKey: "device-A-transaction-tx-sync-001-5",
});

// Simulate remote event that conflicts
const remoteEvents = [
  {
    id: "evt-remote-sync-1",
    entityId: "tx-sync-001",
    entityType: "transaction",
    op: "update",
    vectorClock: { "device-A": 3, "device-B": 4 },
    lamportClock: 4,
    payload: { amount_cents: 200000 },
    deviceId: "device-B",
    actorUserId: "user-1",
    timestamp: Date.now() - 1000,
    idempotencyKey: "device-B-transaction-tx-sync-001-4",
  },
];

await processSyncBatch(remoteEvents);

// Check console for conflict detection warning
// Check conflicts table for new entry
const conflicts = await db.conflicts.where("entityId").equals("tx-sync-001").toArray();
console.log("Conflicts for tx-sync-001:", conflicts);
```

**Expected Output**:

```
Console warning: "Conflict detected during sync: { entityId: 'tx-sync-001', comparison: 'concurrent' }"
Conflicts for tx-sync-001: [ { ... } ]
```

---

## 7. UI Indicator Works (Optional) ✓

If you created the ConflictIndicator component:

### Test 7.1: Indicator Shows When Conflicts Exist

1. Log a test conflict using browser console
2. Navigate to page with ConflictIndicator in header/navigation
3. **Expected**: Yellow warning badge appears with conflict count

### Test 7.2: Popover Shows Details

1. Click the conflict indicator badge
2. **Expected**: Popover opens with:
   - Title: "Sync Conflicts Detected"
   - Message explaining conflicts
   - Link to view details

### Test 7.3: Indicator Hides When No Conflicts

```javascript
import { useConflictStore } from "@/stores/conflictStore";

useConflictStore.getState().clearConflicts();
```

**Expected**: Badge disappears from UI

---

## 8. Helper Functions Work ✓

### Test 8.1: hasPendingConflicts

```javascript
import { hasPendingConflicts } from "@/lib/conflict-detector";

// Check entity with conflicts
const hasConflicts = await hasPendingConflicts("tx-test-003");
console.log("Has conflicts:", hasConflicts);
// Expected: true (if you logged conflicts for this entity)

// Check entity without conflicts
const noConflicts = await hasPendingConflicts("tx-nonexistent");
console.log("No conflicts:", noConflicts);
// Expected: false
```

### Test 8.2: getPendingConflicts

```javascript
import { getPendingConflicts } from "@/lib/conflict-detector";

const pending = await getPendingConflicts();
console.log("All pending conflicts:", pending);
```

**Expected**: Array of conflicts with `resolution: "pending"`

---

## 9. Error Handling Works ✓

### Test 9.1: Invalid Event Structures

```javascript
import { detectConflict } from "@/lib/conflict-detector";

// Missing vectorClock
const invalid1 = { entityId: "tx-1" };
const invalid2 = { entityId: "tx-1" };

try {
  const result = detectConflict(invalid1, invalid2);
  console.log("Result with missing vectorClock:", result);
} catch (err) {
  console.error("Error (expected):", err.message);
}
```

**Expected**: Error caught gracefully, doesn't crash app

### Test 9.2: Database Errors

```javascript
import { logConflict } from "@/lib/conflict-detector";

// Close database temporarily
await db.close();

try {
  await logConflict(localEvent, remoteEvent);
} catch (err) {
  console.error("Database error (expected):", err);
}

// Reopen database
db.open();
```

**Expected**: Error handled gracefully

---

## 10. Performance Check ✓

### Test 10.1: Detection Speed

```javascript
import { detectConflict } from "@/lib/conflict-detector";

const local = {
  entityId: "tx-perf-test",
  vectorClock: { "device-A": 5, "device-B": 3, "device-C": 2 },
};

const remote = {
  entityId: "tx-perf-test",
  vectorClock: { "device-A": 3, "device-B": 5, "device-C": 4 },
};

console.time("conflict-detection");
for (let i = 0; i < 1000; i++) {
  detectConflict(local, remote);
}
console.timeEnd("conflict-detection");
```

**Expected**: < 10ms for 1000 detections (< 0.01ms per detection)

### Test 10.2: Storage Size

```javascript
import { db } from "@/lib/dexie";

const conflicts = await db.conflicts.toArray();
const size = JSON.stringify(conflicts).length;
console.log(`Conflicts storage: ${size} bytes (~${Math.round(size / 1024)}KB)`);
```

**Expected**: < 1KB for ~10 conflicts

---

## 11. Edge Cases Handled ✓

### Test 11.1: Same Event Twice

```javascript
const event = { entityId: "tx-1", vectorClock: { "device-A": 5 } };
const result = detectConflict(event, event);
console.log("Same event:", result);
```

**Expected**: `{ hasConflict: false, comparison: "equal" }`

### Test 11.2: Empty Vector Clocks

```javascript
const event1 = { entityId: "tx-1", vectorClock: {} };
const event2 = { entityId: "tx-1", vectorClock: {} };
const result = detectConflict(event1, event2);
console.log("Empty clocks:", result);
```

**Expected**: `{ hasConflict: false, comparison: "equal" }`

### Test 11.3: Single Device

```javascript
const local = { entityId: "tx-1", vectorClock: { "device-A": 5 } };
const remote = { entityId: "tx-1", vectorClock: { "device-A": 3 } };
const result = detectConflict(local, remote);
console.log("Single device:", result);
```

**Expected**: `{ hasConflict: false, comparison: "local-ahead" }`

---

## 12. Data Integrity ✓

### Test 12.1: Conflict Schema Correct

```javascript
const conflict = await db.conflicts.toArray().then((c) => c[0]);

// Check required fields exist
const requiredFields = [
  "id",
  "entityType",
  "entityId",
  "detectedAt",
  "localEvent",
  "remoteEvent",
  "resolution",
];
const hasAllFields = requiredFields.every((field) => field in conflict);
console.log("Schema correct:", hasAllFields);
```

**Expected**: `true`

### Test 12.2: Timestamps Valid

```javascript
const conflict = await db.conflicts.toArray().then((c) => c[0]);
console.log("Detection time:", conflict.detectedAt);
console.log("Is Date:", conflict.detectedAt instanceof Date);
```

**Expected**: Valid Date object

---

## Success Criteria

All checkpoints must pass:

- [ ] TypeScript compilation passes with no errors
- [ ] Unit tests pass (3/3)
- [ ] Concurrent edits detected correctly
- [ ] Sequential edits not flagged as conflicts
- [ ] Different entities not flagged as conflicts
- [ ] Conflicts logged to IndexedDB
- [ ] Conflict store updates reactively
- [ ] Integration with sync processor working
- [ ] UI indicator shows conflict count (if implemented)
- [ ] Helper functions (hasPendingConflicts, getPendingConflicts) work
- [ ] Error handling graceful
- [ ] Performance acceptable (<0.01ms per detection)
- [ ] Edge cases handled correctly
- [ ] Data integrity maintained

---

## Common Issues

### Issue: Tests fail with "Cannot find module"

**Solution**: Run `npm install` to ensure all dependencies installed

### Issue: TypeScript errors on vectorClock comparison

**Solution**: Ensure `compareVectorClocks()` is properly imported from `vector-clock.ts`

### Issue: Conflicts not appearing in store

**Solution**: Check that `logConflict()` calls `useConflictStore.getState().addConflict()`

### Issue: IndexedDB conflicts table doesn't exist

**Solution**: Bump Dexie version and add conflicts table to schema:

```typescript
this.version(N).stores({
  conflicts: "id, entityId, resolution, detectedAt",
});
```

---

## Cleanup After Testing

Remove test conflicts:

```javascript
import { db } from "@/lib/dexie";
import { useConflictStore } from "@/stores/conflictStore";

// Clear IndexedDB
await db.conflicts.clear();

// Clear Zustand store
useConflictStore.getState().clearConflicts();

console.log("Test conflicts cleared");
```

---

## Next Steps

Once all checkpoints pass:

1. Clean up test data
2. Commit conflict detection code
3. Move to **Chunk 033: Conflict Resolution**

---

**Estimated Time**: 20-30 minutes to verify all checkpoints
