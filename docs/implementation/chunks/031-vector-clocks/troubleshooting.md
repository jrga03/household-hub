# Troubleshooting: Vector Clocks

Common issues and solutions when implementing vector clocks.

---

## Vector Clock Comparison Issues

### Problem: Comparison always returns "concurrent" even for sequential edits

**Symptoms**:

```javascript
const v1 = { device1: 1 };
const v2 = { device1: 2 };
compareVectorClocks(v2, v1); // Returns "concurrent" (wrong!)
// Should return "local-ahead"
```

**Cause**: Logic error in comparison function

**Solution**:

Check the comparison logic in `vector-clock.ts`:

```typescript
// Correct implementation
for (const device of devices) {
  const t1 = v1[device] || 0; // Use 0 for missing devices
  const t2 = v2[device] || 0;

  if (t1 > t2) v1Ahead = true;
  if (t2 > t1) v2Ahead = true;
}

// WRONG: Don't skip missing devices
for (const device of devices) {
  if (!v1[device] || !v2[device]) continue; // ❌ Don't do this
  // ...
}
```

---

### Problem: Vector clock comparison fails with missing devices

**Symptoms**:

```javascript
compareVectorClocks({ device1: 5 }, { device1: 3, device2: 2 });
// TypeError or unexpected result
```

**Cause**: Not handling missing device entries

**Solution**:

Use `|| 0` fallback for missing devices:

```typescript
const t1 = v1[device] || 0; // Default to 0 if device not in clock
const t2 = v2[device] || 0;
```

---

## Lamport Clock Issues

### Problem: Lamport clock doesn't increment

**Symptoms**:

- Multiple events for same entity all have `lamportClock: 1`
- Clock state not updating in meta table

**Cause**: Not calling `getNextLamportClock()` or meta table not updating

**Solution**:

Verify in `event-generator.ts`:

```typescript
// Correct: Get NEXT lamport clock (increments)
const lamportClock = await lamportClockManager.getNextLamportClock(entityId);

// WRONG: Get current (doesn't increment)
const lamportClock = await lamportClockManager.getCurrentLamportClock(entityId);
```

Check meta table updates:

```javascript
const state = await db.meta.get(`clock:${entityId}`);
console.log("Stored lamport:", state?.value?.lamportClock);
```

---

### Problem: Lamport clocks conflict across entities

**Symptoms**:

```javascript
// Entity A event: lamportClock = 5
// Entity B event: lamportClock = 6
// But they're different entities!
```

**Cause**: Using global lamport clock instead of per-entity

**Solution**:

Ensure clock state keyed by entity ID:

```typescript
// Correct: Per-entity clock
await db.meta.put({
  key: `clock:${entityId}`, // ← Include entity ID
  value: { lamportClock: next },
});

// WRONG: Global clock
await db.meta.put({
  key: "clock", // ❌ Same key for all entities
  value: { lamportClock: next },
});
```

---

## Vector Clock Storage Issues

### Problem: Vector clock saved as string instead of object

**Symptoms**:

```javascript
const event = await db.events.get("event-id");
console.log(typeof event.vectorClock); // "string"
// Should be "object"
```

**Cause**: Manual serialization when Dexie handles it automatically

**Solution**:

Don't serialize vector clocks for IndexedDB:

```typescript
// Correct: Store as object (Dexie handles serialization)
await db.events.add({
  vectorClock: { device1: 5 }, // ✓
});

// WRONG: Manual serialization
await db.events.add({
  vectorClock: JSON.stringify({ device1: 5 }), // ❌
});
```

Only serialize for Supabase:

```typescript
// When sending to Supabase
await supabase.from("transaction_events").insert({
  vector_clock: JSON.stringify(vectorClock), // ✓ Supabase needs string
});
```

---

### Problem: Vector clock lost on sync to Supabase

**Symptoms**:

- Event in IndexedDB has vector clock
- Same event in Supabase has `null` vector_clock

**Cause**: Supabase column type mismatch or RPC function not handling JSONB

**Solution**:

Check Supabase column type:

```sql
-- Correct: JSONB type for vector_clock
ALTER TABLE transaction_events
ALTER COLUMN vector_clock TYPE JSONB;

-- WRONG: TEXT type
ALTER COLUMN vector_clock TYPE TEXT;  -- ❌ Will cause issues
```

Serialize before insert:

```typescript
await supabase.from("transaction_events").insert({
  vector_clock: vectorClock, // Supabase JS client handles JSONB
});
```

---

## Merging Issues

### Problem: Merged clock doesn't preserve causality

**Symptoms**:

```javascript
const merged = mergeVectorClocks(v1, v2);
compareVectorClocks(merged, v1); // Returns "equal" (wrong!)
// Should return "local-ahead" or "equal"
```

**Cause**: Not taking element-wise maximum

**Solution**:

Verify merge logic:

```typescript
// Correct: Element-wise max
for (const device of devices) {
  merged[device] = Math.max(v1[device] || 0, v2[device] || 0); // ✓
}

// WRONG: Overwriting values
for (const device of devices) {
  merged[device] = v2[device] || v1[device]; // ❌
}
```

---

### Problem: Merge not commutative

**Symptoms**:

```javascript
mergeVectorClocks(v1, v2) !== mergeVectorClocks(v2, v1);
```

**Cause**: Order-dependent logic in merge

**Solution**:

Use `Math.max()` which is commutative:

```typescript
merged[device] = Math.max(v1[device] || 0, v2[device] || 0);
```

Test with unit test:

```typescript
it("should be commutative", () => {
  const v1 = { device1: 5, device2: 3 };
  const v2 = { device1: 3, device2: 7 };

  expect(mergeVectorClocks(v1, v2)).toEqual(mergeVectorClocks(v2, v1));
});
```

---

## Event Generation Issues

### Problem: Events generated without vector clocks

**Symptoms**:

```javascript
const event = await createEvent({ ... });
console.log(event.vectorClock);  // undefined
```

**Cause**: Not calling `updateVectorClock()` in event creation

**Solution**:

Update `createEvent()`:

```typescript
export async function createEvent(params) {
  // ... other code ...

  // MUST call these:
  const lamportClock = await lamportClockManager.getNextLamportClock(entityId);
  const vectorClock = await lamportClockManager.updateVectorClock(entityId, deviceId);

  return {
    // ...
    lamportClock,
    vectorClock, // ← Include in event
  };
}
```

---

### Problem: All events have same vector clock

**Symptoms**:

- Event 1: `{ device1: 1 }`
- Event 2: `{ device1: 1 }` (should be 2!)

**Cause**: Not incrementing vector clock per event

**Solution**:

Check `updateVectorClock()`:

```typescript
async updateVectorClock(entityId: string, deviceId: string): Promise<VectorClock> {
  const current = await this.getCurrentVectorClock(entityId);

  // Correct: Increment
  const updated = incrementVectorClock(current, deviceId);  // ✓

  // WRONG: Don't return current
  return current;  // ❌
}
```

---

## Performance Issues

### Problem: Vector clock operations are slow

**Symptoms**:

- Event creation takes >100ms
- Clock comparison takes >10ms

**Cause**: Inefficient clock operations or excessive database reads

**Solution 1**: Cache device ID

```typescript
// Cache device ID instead of fetching every time
let cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  cachedDeviceId = await deviceManager.getDeviceId();
  return cachedDeviceId;
}
```

**Solution 2**: Batch clock updates

```typescript
// Update clock once per transaction, not per field
await db.transaction("rw", [db.events, db.meta], async () => {
  const lamportClock = await getNextLamportClock(entityId);
  const vectorClock = await updateVectorClock(entityId, deviceId);

  await db.events.add(event);
});
```

---

## Type Issues

### Problem: TypeScript error "Type 'Record<string, number>' is not assignable to type 'VectorClock'"

**Symptoms**:

```typescript
const clock: VectorClock = { device1: 5 }; // TS error
```

**Cause**: VectorClock type definition issue

**Solution**:

Use index signature in type:

```typescript
// Correct:
export interface VectorClock {
  [deviceId: string]: number; // ✓ Index signature
}

// WRONG:
export type VectorClock = {
  deviceId: number; // ❌ Specific property
};
```

---

## Testing Issues

### Problem: Integration tests fail with "Cannot find table 'meta'"

**Symptoms**:

```
Error: Table meta does not exist
```

**Cause**: Dexie schema not initialized in test

**Solution**:

Initialize database in test setup:

```typescript
beforeEach(async () => {
  await db.delete(); // Clean slate
  await db.open(); // Reinitialize
});

afterEach(async () => {
  await db.close();
});
```

---

### Problem: Concurrent edit tests don't trigger conflicts

**Symptoms**:

```javascript
// Expecting "concurrent", getting "local-ahead"
```

**Cause**: Events created sequentially on same device

**Solution**:

Simulate two devices:

```typescript
// Mock different device IDs
vi.mock("@/lib/device-manager", () => ({
  deviceManager: {
    getDeviceId: vi.fn()
      .mockResolvedValueOnce("device-A")
      .mockResolvedValueOnce("device-B"),
  },
}));

// Now events have different device origins
const event1 = await createEvent({ ... });  // device-A
const event2 = await createEvent({ ... });  // device-B
```

---

## Debugging Tips

### 1. Log vector clock comparisons

```typescript
import { logVectorClockComparison } from "@/lib/vector-clock-debug";

logVectorClockComparison("Sync Check", localClock, remoteClock);
```

### 2. Inspect meta table

```javascript
// Check all clock states
const allClocks = await db.meta.where("key").startsWith("clock:").toArray();
console.table(allClocks);
```

### 3. Verify clock properties

```typescript
it("should have valid clock properties", () => {
  const clock = { device1: 5, device2: 3 };

  // All values should be positive integers
  Object.values(clock).forEach((value) => {
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });
});
```

### 4. Check event ordering

```javascript
// Events should be ordered by lamport clock
const events = await db.events.where("entityId").equals(entityId).sortBy("lamportClock");

events.forEach((event, index) => {
  console.assert(event.lamportClock === index + 1, "Clock gap detected!");
});
```

---

## Prevention Tips

1. **Always use || 0 for missing devices** in comparisons
2. **Test with empty clocks** to catch edge cases
3. **Verify clock increments** in integration tests
4. **Use per-entity keys** for clock state storage
5. **Cache device ID** to reduce lookups
6. **Log comparisons** during development for visibility
7. **Test commutativity** of merge operations
8. **Validate clock types** in TypeScript

---

## Getting Help

If you're stuck:

1. Check unit tests are passing: `npm test src/lib/vector-clock.test.ts`
2. Inspect meta table: `db.meta.toArray()`
3. Log vector clock comparisons
4. Verify device ID is stable across events
5. Check Dexie schema version is up to date
6. Review SYNC-ENGINE.md lines 279-363 for algorithm details

---

## Quick Fixes

```bash
# Reset IndexedDB (clears all clock state)
localStorage.clear();
indexedDB.deleteDatabase("HouseholdHubDB");

# Run tests with verbose output
npm test src/lib/vector-clock.test.ts -- --reporter=verbose

# Check TypeScript types
npx tsc --noEmit src/lib/vector-clock.ts
```

---

**Remember**: Vector clocks are the foundation of conflict detection. When in doubt, add more logging and unit tests.
