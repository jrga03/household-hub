# Troubleshooting: Conflict Detection

Common issues and solutions when implementing conflict detection.

---

## Unit Testing Issues

### Problem: Tests fail with "Cannot find module '@/lib/conflict-detector'"

**Symptoms**:

```
Error: Cannot find module '@/lib/conflict-detector'
at src/lib/conflict-detector.test.ts:1
```

**Cause**: Path alias not configured in Vitest or test file not finding module

**Solution 1**: Update `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**Solution 2**: Restart test runner after config changes:

```bash
# Kill existing test processes
pkill -f vitest

# Restart
npm test
```

---

### Problem: Unit tests fail with "compareVectorClocks is not a function"

**Symptoms**:

```
TypeError: compareVectorClocks is not a function
at detectConflict (conflict-detector.ts:15)
```

**Cause**: Missing or incorrect import from vector-clock module

**Solution**: Verify import and export in `src/lib/vector-clock.ts`:

```typescript
// src/lib/vector-clock.ts
export function compareVectorClocks(v1: VectorClock, v2: VectorClock): ClockComparison {
  // ... implementation
}

// src/lib/conflict-detector.ts
import { compareVectorClocks } from "./vector-clock"; // ← Ensure correct path
```

---

### Problem: Tests pass locally but fail in CI

**Symptoms**:

- Local: All tests pass
- CI: "detectConflict is not defined"

**Cause**: Missing dependencies or different module resolution in CI

**Solution 1**: Ensure dependencies in `package.json`:

```json
{
  "dependencies": {
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@testing-library/react": "^14.0.0"
  }
}
```

**Solution 2**: Add CI-specific test command:

```bash
# In package.json
"test:ci": "vitest run --reporter=verbose"
```

---

## Conflict Detection Logic Issues

### Problem: All edits detected as conflicts (false positives)

**Symptoms**:

- Every remote event triggers conflict detection
- Even sequential edits marked as conflicts
- Console flooded with conflict warnings

**Cause**: Vector clock comparison logic inverted or broken

**Solution**: Verify `compareVectorClocks()` returns correct comparison:

```typescript
// Test comparison logic
const test1 = { "device-A": 5, "device-B": 3 };
const test2 = { "device-A": 7, "device-B": 4 };

const result = compareVectorClocks(test1, test2);
console.log(result); // Should be "remote-ahead", not "concurrent"
```

If returning wrong value, check implementation:

```typescript
export function compareVectorClocks(v1: VectorClock, v2: VectorClock): ClockComparison {
  const allDevices = new Set([...Object.keys(v1), ...Object.keys(v2)]);

  let v1Ahead = false;
  let v2Ahead = false;

  for (const device of allDevices) {
    const t1 = v1[device] || 0;
    const t2 = v2[device] || 0;

    if (t1 > t2) v1Ahead = true; // ← Check these conditions
    if (t2 > t1) v2Ahead = true; // ← Are correct
  }

  if (v1Ahead && v2Ahead) return "concurrent"; // ← Both ahead = conflict
  if (v1Ahead) return "local-ahead";
  if (v2Ahead) return "remote-ahead";
  return "equal";
}
```

---

### Problem: No conflicts detected (false negatives)

**Symptoms**:

- Known concurrent edits not detected
- Conflicts logged shows 0 entries
- Silent data overwrites happening

**Cause 1**: Vector clocks not included in events

**Solution**: Verify events have vectorClock field:

```typescript
const event = await db.events.toArray().then((e) => e[0]);
console.log("Event structure:", event);
console.log("Has vectorClock:", "vectorClock" in event);

// If false, ensure event generation includes vector clocks (chunk 031)
```

**Cause 2**: Same device ID used for both "devices"

**Solution**: Check device IDs are different:

```typescript
import { getDeviceId } from "@/lib/device-manager";

const deviceId = await getDeviceId();
console.log("Current device ID:", deviceId);

// In tests, manually set different device IDs
const localEvent = { deviceId: "device-A", vectorClock: { "device-A": 5 } };
const remoteEvent = { deviceId: "device-B", vectorClock: { "device-B": 3 } };
```

---

### Problem: Different entities flagged as conflicts

**Symptoms**:

```
Conflict detected: { entityId: 'tx-A' } vs { entityId: 'tx-B' }
```

**Cause**: Missing entity ID check in detectConflict()

**Solution**: Add entity ID validation:

```typescript
export function detectConflict(
  localEvent: TransactionEvent,
  remoteEvent: TransactionEvent
): ConflictDetectionResult {
  // CRITICAL: Check entity IDs first
  if (localEvent.entityId !== remoteEvent.entityId) {
    return {
      hasConflict: false,
      reason: "Different entities",
      comparison: "equal", // or undefined
    };
  }

  // Then check vector clocks
  const comparison = compareVectorClocks(localEvent.vectorClock, remoteEvent.vectorClock);

  // ... rest of logic
}
```

---

## IndexedDB & Storage Issues

### Problem: Conflicts table doesn't exist

**Symptoms**:

```
DOMException: Failed to execute 'transaction' on 'IDBDatabase':
One of the specified object stores was not found.
```

**Cause**: Dexie schema missing conflicts table

**Solution**: Add to Dexie schema and bump version:

```typescript
// src/lib/dexie.ts
class HouseholdDB extends Dexie {
  conflicts!: Table<Conflict>;
  // ... other tables

  constructor() {
    super("HouseholdHub");

    // Bump version number when adding new table
    this.version(5).stores({
      // ← Increment version
      transactions: "id, household_id, date, account_id",
      accounts: "id, household_id",
      categories: "id, household_id",
      events: "id, entityId, timestamp",
      conflicts: "id, entityId, resolution, detectedAt", // ← Add this
    });
  }
}
```

**Important**: Incrementing version triggers migration. Existing data preserved.

---

### Problem: "Version change transaction was aborted"

**Symptoms**:

```
Error opening database: Version change transaction was aborted
```

**Cause**: Browser has older version open, or migration failed

**Solution 1**: Close all tabs and reopen:

```bash
# Or force close database in DevTools
# Application → IndexedDB → Right-click database → Delete
```

**Solution 2**: Add migration handler:

```typescript
this.version(5)
  .stores({
    conflicts: "id, entityId, resolution, detectedAt",
  })
  .upgrade((trans) => {
    console.log("Migrating to version 5: Adding conflicts table");
    // Migration logic if needed
    return trans.conflicts.toCollection().modify(() => {});
  });
```

---

### Problem: Conflicts not persisting across page refreshes

**Symptoms**:

- Log conflicts successfully
- Refresh page
- Conflicts array empty

**Cause**: Not loading conflicts from IndexedDB on app startup

**Solution**: Add initialization in App.tsx:

```typescript
// src/App.tsx
import { useEffect } from "react";
import { db } from "@/lib/dexie";
import { useConflictStore } from "@/stores/conflictStore";

function App() {
  useEffect(() => {
    // Load conflicts on mount
    async function loadConflicts() {
      const conflicts = await db.conflicts.toArray();
      conflicts.forEach(conflict => {
        useConflictStore.getState().addConflict(conflict);
      });
      console.log(`Loaded ${conflicts.length} conflicts`);
    }

    loadConflicts();
  }, []);

  return <>{/* ... */}</>;
}
```

---

## Zustand Store Issues

### Problem: Conflict store not updating UI

**Symptoms**:

- Conflicts logged successfully
- Store state changes in DevTools
- UI doesn't re-render

**Cause**: Component not subscribed to store

**Solution**: Use proper store hook:

```typescript
// ❌ Wrong - doesn't subscribe
const { conflicts } = useConflictStore.getState();

// ✅ Correct - subscribes to updates
const conflicts = useConflictStore((state) => state.conflicts);

// ✅ Alternative - subscribe to specific value
const pendingCount = useConflictStore((state) => state.getPendingCount());
```

---

### Problem: "useConflictStore is not a function"

**Symptoms**:

```
TypeError: useConflictStore is not a function
at ConflictIndicator.tsx:5
```

**Cause**: Incorrect export or import

**Solution**: Verify export in store:

```typescript
// src/stores/conflictStore.ts
import { create } from "zustand";

export const useConflictStore = create<ConflictStore>((set, get) => ({
  // ↑ Named export
  conflicts: [],
  // ...
}));

// In component:
import { useConflictStore } from "@/stores/conflictStore"; // ← Named import
```

---

### Problem: Store updates but getPendingCount() returns stale value

**Symptoms**:

- conflicts array updated
- getPendingCount() returns old count

**Cause**: getPendingCount not reactive

**Solution**: Use selector pattern:

```typescript
// ❌ Wrong - getPendingCount called outside render
const count = useConflictStore.getState().getPendingCount();

// ✅ Correct - compute in selector
const pendingCount = useConflictStore(
  (state) => state.conflicts.filter((c) => c.resolution === "pending").length
);

// ✅ Alternative - use selector function
const pendingCount = useConflictStore((state) => state.getPendingCount());
```

---

## Integration Issues

### Problem: Conflicts not detected during sync

**Symptoms**:

- Manual `detectConflict()` works
- Real sync doesn't detect conflicts
- No console warnings

**Cause**: Sync processor not calling conflict detection

**Solution**: Verify integration in sync processor:

```typescript
// src/lib/sync-processor.ts
import { detectConflict, logConflict } from "./conflict-detector";

export async function processRemoteEvent(remoteEvent: TransactionEvent) {
  // Get local version
  const localEvent = await db.events.where("entityId").equals(remoteEvent.entityId).last();

  if (localEvent) {
    // ← ADD THIS: Detect conflict
    const detection = detectConflict(localEvent, remoteEvent);

    if (detection.hasConflict) {
      console.warn("Conflict detected:", remoteEvent.entityId);
      await logConflict(localEvent, remoteEvent);
      // Resolve conflict (chunk 033)
      return;
    }
  }

  // No conflict - apply remote event
  await applyRemoteEvent(remoteEvent);
}
```

---

### Problem: logConflict() throws "useConflictStore.getState is not a function"

**Symptoms**:

```
TypeError: useConflictStore.getState is not a function
at logConflict (conflict-detector.ts:45)
```

**Cause**: Circular dependency or import order issue

**Solution**: Import store at function level:

```typescript
// ❌ Wrong - top-level import causes circular dependency
import { useConflictStore } from "@/stores/conflictStore";

export async function logConflict(...) {
  useConflictStore.getState().addConflict(conflict);  // Error
}

// ✅ Correct - dynamic import
export async function logConflict(...) {
  const { useConflictStore } = await import("@/stores/conflictStore");
  useConflictStore.getState().addConflict(conflict);  // Works
}
```

---

## UI Component Issues

### Problem: ConflictIndicator doesn't show

**Symptoms**:

- Conflicts exist in store
- Component imported and placed in layout
- Nothing renders

**Cause**: Conditional rendering hiding component

**Solution**: Check render logic:

```typescript
export function ConflictIndicator() {
  const pendingCount = useConflictStore(state => state.getPendingCount());

  console.log("Pending count:", pendingCount);  // ← Add debug log

  if (pendingCount === 0) return null;  // ← Check this condition

  return (
    <div>
      {pendingCount} conflicts
    </div>
  );
}
```

If `pendingCount` is 0 but conflicts exist, check store subscription.

---

### Problem: Popover doesn't open on click

**Symptoms**:

- ConflictIndicator renders
- Clicking badge does nothing
- No errors in console

**Cause**: Missing Popover component from shadcn/ui

**Solution**: Install Popover component:

```bash
npx shadcn-ui@latest add popover
```

Verify import:

```typescript
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
```

---

## Performance Issues

### Problem: Conflict detection slow with many events

**Symptoms**:

- Sync takes several seconds
- Browser freezes during sync
- Console shows many conflict checks

**Cause**: Checking every remote event against all local events

**Solution**: Optimize with indexed lookup:

```typescript
// ❌ Slow - O(n) lookup for each remote event
for (const remoteEvent of remoteEvents) {
  const localEvents = await db.events.toArray(); // Gets ALL events
  const matching = localEvents.find((e) => e.entityId === remoteEvent.entityId);
}

// ✅ Fast - O(log n) indexed lookup
for (const remoteEvent of remoteEvents) {
  const localEvent = await db.events.where("entityId").equals(remoteEvent.entityId).last(); // ← Uses index
}
```

---

### Problem: Conflicts table growing unbounded

**Symptoms**:

- Thousands of old conflicts
- IndexedDB quota warnings
- Slow conflict queries

**Cause**: No cleanup of resolved conflicts

**Solution**: Add periodic cleanup:

```typescript
// src/lib/conflict-detector.ts

/**
 * Clean up old resolved conflicts (>90 days)
 */
export async function cleanupOldConflicts() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const deleted = await db.conflicts
    .where("resolution")
    .equals("resolved")
    .and((c) => c.resolvedAt && c.resolvedAt < cutoff)
    .delete();

  console.log(`Cleaned up ${deleted} old conflicts`);
  return deleted;
}

// Call on app startup or periodically
// In App.tsx or background worker
useEffect(() => {
  cleanupOldConflicts();
}, []);
```

---

## TypeScript Issues

### Problem: Type error on vectorClock field

**Symptoms**:

```
Property 'vectorClock' does not exist on type 'TransactionEvent'
```

**Cause**: Type definition missing vectorClock

**Solution**: Update TransactionEvent interface:

```typescript
// src/types/sync.ts
export interface TransactionEvent {
  id: string;
  entityType: "transaction" | "account" | "category" | "budget";
  entityId: string;
  op: "create" | "update" | "delete";
  payload: any;

  // ← ADD THESE
  vectorClock: VectorClock;
  lamportClock: number;

  deviceId: string;
  actorUserId: string;
  timestamp: number;
  idempotencyKey: string;
}

export interface VectorClock {
  [deviceId: string]: number;
}
```

---

### Problem: Type error on Conflict.resolvedValue

**Symptoms**:

```
Type 'undefined' is not assignable to type 'any'
```

**Cause**: Strict TypeScript checking on optional field

**Solution**: Mark field as optional:

```typescript
export interface Conflict {
  id: string;
  // ... other fields
  resolution: "pending" | "resolved" | "manual";
  resolvedValue?: any; // ← Optional with ?
  resolvedAt?: Date; // ← Optional with ?
}
```

---

## Prevention Tips

1. **Always check entity IDs first**: Prevents false positives from unrelated entities
2. **Test vector clock logic thoroughly**: Use property-based tests for edge cases
3. **Index entityId in conflicts table**: Improves query performance
4. **Log conflicts with context**: Include timestamps, device IDs for debugging
5. **Monitor conflict rates**: Alert if conflict rate exceeds threshold (>10% of syncs)
6. **Clean up old conflicts periodically**: Prevent unbounded storage growth
7. **Use TypeScript strict mode**: Catches type errors at compile time

---

## Debugging Checklist

When conflicts aren't working:

1. **Check vector clocks exist**:

   ```javascript
   const event = await db.events.toArray().then((e) => e[0]);
   console.log("Has vectorClock:", "vectorClock" in event);
   ```

2. **Check device IDs are different**:

   ```javascript
   const local = await db.events.where("deviceId").equals("device-A").first();
   const remote = await db.events.where("deviceId").equals("device-B").first();
   console.log("Different devices:", local && remote);
   ```

3. **Check compareVectorClocks() works**:

   ```javascript
   const result = compareVectorClocks({ "device-A": 5 }, { "device-A": 3 });
   console.log("Comparison:", result); // Should be "local-ahead"
   ```

4. **Check conflicts table exists**:

   ```javascript
   const tables = await db.tables.map((t) => t.name);
   console.log("Tables:", tables); // Should include "conflicts"
   ```

5. **Check store subscription**:
   ```javascript
   const count = useConflictStore((state) => state.getPendingCount());
   console.log("Pending count:", count);
   ```

---

## Getting Help

If you're still stuck:

1. Check this troubleshooting guide first
2. Review chunk 031 (vector clocks) if clock comparison failing
3. Inspect IndexedDB in DevTools → Application
4. Check console for warnings/errors
5. Add debug logs to detectConflict() and logConflict()
6. Test with minimal reproduction case
7. Verify integration with sync processor (chunk 024)

---

## Quick Fixes

```bash
# Reset all conflicts for fresh start
await db.conflicts.clear();
useConflictStore.getState().clearConflicts();

# Check Dexie version and schema
console.log("Dexie version:", db.verno);
console.log("Tables:", db.tables.map(t => t.name));

# Force IndexedDB refresh
await db.close();
await db.open();

# Check if conflicts table indexed correctly
const conflicts = await db.conflicts.toArray();
console.log("Sample conflict:", conflicts[0]);
```

---

**Remember**: Conflict detection is critical for data integrity. When in doubt, add more logging and tests rather than less.
