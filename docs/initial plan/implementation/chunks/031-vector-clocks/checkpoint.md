# Checkpoint: Vector Clocks

Run these verifications to ensure everything works correctly.

---

## Prerequisites Check ✓

Before running these checkpoints, verify:

- [ ] Chunk 030 completed (event generation hooks exist)
- [ ] Chunk 029 completed (DeviceManager.getDeviceId() available)
- [ ] Dexie schema includes `meta` table
- [ ] Supabase `transaction_events` has `lamport_clock` and `vector_clock` columns

If any prerequisite is missing, complete it first or tests will fail.

---

## 1. Unit Tests Pass ✓

```bash
npm test src/lib/vector-clock.test.ts
```

**Expected**:

```
✓ Vector Clock Comparison (6 tests)
✓ Vector Clock Merging (4 tests)
✓ Vector Clock Operations (6 tests)
✓ Vector Clock Properties (3 tests)

Test Files  1 passed (1)
     Tests  19 passed (19)
```

All tests should pass with no failures.

---

## 2. Type Checking Passes ✓

```bash
npm run type-check
```

**Expected**: No TypeScript errors in:

- `src/types/sync.ts`
- `src/lib/vector-clock.ts`
- `src/lib/event-generator.ts`

---

## 3. Vector Clock Comparison Works ✓

Open browser console and test:

```javascript
import { compareVectorClocks } from "@/lib/vector-clock";

// Test 1: Equal clocks
compareVectorClocks({ device1: 5, device2: 3 }, { device1: 5, device2: 3 });
// Expected: "equal"

// Test 2: Local ahead (sequential edit)
compareVectorClocks({ device1: 5, device2: 3 }, { device1: 3, device2: 2 });
// Expected: "local-ahead"

// Test 3: Remote ahead
compareVectorClocks({ device1: 3, device2: 2 }, { device1: 5, device2: 3 });
// Expected: "remote-ahead"

// Test 4: Concurrent (conflict!)
compareVectorClocks({ device1: 5, device2: 2 }, { device1: 3, device2: 4 });
// Expected: "concurrent"
```

---

## 4. Vector Clock Merging Works ✓

```javascript
import { mergeVectorClocks } from "@/lib/vector-clock";

// Test 1: Element-wise maximum
mergeVectorClocks({ device1: 5, device2: 3 }, { device1: 3, device2: 7 });
// Expected: { device1: 5, device2: 7 }

// Test 2: Disjoint devices
mergeVectorClocks({ device1: 5 }, { device2: 3 });
// Expected: { device1: 5, device2: 3 }
```

---

## 5. Event Generation Includes Vector Clocks ✓

Create a test transaction and check event:

```javascript
import { createEvent } from "@/lib/event-generator";
import { db } from "@/lib/dexie";

// Create event
await createEvent({
  entityType: "transaction",
  entityId: "test-tx-123",
  op: "create",
  payload: { amount: 1000 },
});

// Check event in IndexedDB
const event = await db.events.where("entityId").equals("test-tx-123").first();

console.log("Event lamport clock:", event.lamportClock); // Should be 1
console.log("Event vector clock:", event.vectorClock); // Should have device entry
```

**Expected**:

- `lamportClock`: 1 (first event for this entity)
- `vectorClock`: Object with at least one device entry like `{ "device-abc123": 1 }`

---

## 6. Lamport Clock Increments Per Entity ✓

Create multiple events for same entity:

```javascript
// Event 1
await createEvent({
  entityType: "transaction",
  entityId: "tx-123",
  op: "create",
  payload: { amount: 1000 },
});

// Event 2 (same entity)
await createEvent({
  entityType: "transaction",
  entityId: "tx-123",
  op: "update",
  payload: { amount: 2000 },
});

// Check events
const events = await db.events.where("entityId").equals("tx-123").sortBy("lamportClock");

console.log("Event 1 lamport:", events[0].lamportClock); // 1
console.log("Event 2 lamport:", events[1].lamportClock); // 2
```

**Expected**: Lamport clocks increment: 1, 2

---

## 7. Independent Clocks Per Entity ✓

Create events for different entities:

```javascript
// Entity A
await createEvent({
  entityType: "transaction",
  entityId: "tx-A",
  op: "create",
  payload: {},
});

// Entity B
await createEvent({
  entityType: "transaction",
  entityId: "tx-B",
  op: "create",
  payload: {},
});

// Check lamport clocks
const eventA = await db.events.where("entityId").equals("tx-A").first();
const eventB = await db.events.where("entityId").equals("tx-B").first();

console.log("Entity A lamport:", eventA.lamportClock); // 1
console.log("Entity B lamport:", eventB.lamportClock); // 1
```

**Expected**: Both start at 1 (independent clocks)

---

## 8. Clock State Persists in Meta Table ✓

```javascript
import { db } from "@/lib/dexie";

// Check meta table for clock state
const clockState = await db.meta.get("clock:tx-123");

console.log("Lamport clock:", clockState.value.lamportClock);
console.log("Vector clock:", clockState.value.vectorClock);
```

**Expected**:

- `lamportClock`: Matches last event's lamport clock
- `vectorClock`: Has device entries matching events

---

## 9. Vector Clock Debugging Utilities Work ✓

```javascript
import { formatVectorClock, logVectorClockComparison } from "@/lib/vector-clock-debug";

const clock = { "device-abc123": 5, "device-xyz789": 3 };

// Test formatting
const formatted = formatVectorClock(clock);
console.log(formatted);
// Expected: "{device-a:5, device-x:3}"

// Test comparison logging
const local = { device1: 5, device2: 2 };
const remote = { device1: 3, device2: 4 };

logVectorClockComparison("Test", local, remote);
// Expected: Console log showing comparison
```

---

## 10. Integration Test Passes ✓

```bash
npm test tests/integration/vector-clock-integration.test.ts
```

**Expected**: All integration tests pass

---

## 11. Database Schema Updated ✓

Check Dexie schema:

```javascript
import { db } from "@/lib/dexie";

// Check events table includes vector clock
const event = await db.events.limit(1).first();

console.log("Event has lamportClock:", "lamportClock" in event);
console.log("Event has vectorClock:", "vectorClock" in event);
```

**Expected**: Both should be `true`

---

## 12. Causality Detection Works ✓

Simulate sequential vs concurrent edits:

```javascript
// Sequential edits (device A twice)
const event1 = await createEvent({
  entityType: "transaction",
  entityId: "tx-seq",
  op: "create",
  payload: { amount: 1000 },
});

const event2 = await createEvent({
  entityType: "transaction",
  entityId: "tx-seq",
  op: "update",
  payload: { amount: 2000 },
});

const comparison = compareVectorClocks(event2.vectorClock, event1.vectorClock);
console.log("Sequential comparison:", comparison);
// Expected: "local-ahead" (no conflict)
```

For concurrent edits, you'd need to simulate two devices creating conflicting edits (covered in chunk 032).

---

## Success Criteria

- [ ] All 19+ unit tests pass
- [ ] Type checking passes with no errors
- [ ] Vector clock comparison works correctly
- [ ] Vector clock merging produces correct results
- [ ] Events include lamportClock and vectorClock
- [ ] Lamport clocks increment per entity
- [ ] Independent clocks per entity verified
- [ ] Clock state persists in meta table
- [ ] Debugging utilities work
- [ ] Integration tests pass
- [ ] Database schema includes clock fields
- [ ] Causality detection working

---

## Common Issues

### Issue: Tests fail with "Cannot find module @/lib/vector-clock"

**Solution**: Ensure path alias configured in `vitest.config.ts`

### Issue: Vector clock is empty object `{}`

**Solution**: Check that `deviceManager.getDeviceId()` returns valid device ID

### Issue: Lamport clock doesn't increment

**Solution**: Verify `getNextLamportClock()` is being called and meta table updates

### Issue: TypeScript error on VectorClock type

**Solution**: Import from `@/types/sync`, not `@/lib/vector-clock`

---

## Next Steps

Once all checkpoints pass:

1. Verify all tests passing: `npm test`
2. Commit vector clock implementation
3. Move to **Chunk 032: Conflict Detection**

---

**Estimated Time**: 20-30 minutes to verify all checkpoints
