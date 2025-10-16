# Troubleshooting: Conflict Resolution

Common issues and solutions when implementing conflict resolution.

---

## Resolution Logic Issues

### Problem: Wrong version wins consistently

**Symptoms**:

- Local version always wins (or vice versa)
- Lamport clock comparison seems inverted
- Resolution doesn't match expected winner

**Cause**: Incorrect comparison operator in `resolveRecordLWW()`

**Solution**: Verify comparison logic:

```typescript
private resolveRecordLWW(local: TransactionEvent, remote: TransactionEvent) {
  const localOrder = `${local.lamportClock}-${local.deviceId}`;
  const remoteOrder = `${remote.lamportClock}-${remote.deviceId}`;

  // CRITICAL: Use > not <
  const winner = localOrder > remoteOrder ? local : remote;  // ← Check this
  const loser = winner === local ? remote : local;

  return { winner, loser, strategy: "record-lww", reason: "..." };
}
```

**Test**:

```javascript
// Local lamport 7, remote lamport 5 → local should win
const result = await resolver.resolveConflict(
  { lamportClock: 7, deviceId: "A" },
  { lamportClock: 5, deviceId: "B" }
);
console.log("Winner lamport:", result.winner.lamportClock); // Should be 7
```

---

### Problem: DELETE doesn't win over UPDATE

**Symptoms**:

- UPDATE with higher lamport wins over DELETE
- Deleted entities resurrected after sync
- Console shows "record-lww" instead of "delete-wins"

**Cause**: DELETE check missing or placed after LWW logic

**Solution**: Ensure DELETE check happens FIRST:

```typescript
async resolveConflict(local: TransactionEvent, remote: TransactionEvent) {
  // ← MUST BE FIRST - before any other logic
  if (local.op === "delete" || remote.op === "delete") {
    return this.resolveDeleteConflict(local, remote);
  }

  // Then record-level LWW
  return this.resolveRecordLWW(local, remote);
}
```

**Test**:

```javascript
const update = { op: "update", lamportClock: 10 };
const del = { op: "delete", lamportClock: 3 };

const result = await resolver.resolveConflict(update, del);
console.log("Winner op:", result.winner.op); // Should be "delete"
console.log("Strategy:", result.strategy); // Should be "delete-wins"
```

---

### Problem: Tie-breaking non-deterministic

**Symptoms**:

- Same conflict resolves differently on different runs
- Different devices get different winners
- Tests fail intermittently

**Cause**: Non-deterministic tie-breaking (e.g., using timestamp instead of deviceId)

**Solution**: Use lexicographic deviceId comparison:

```typescript
// ❌ Wrong - uses timestamp (non-deterministic)
const winner = local.timestamp > remote.timestamp ? local : remote;

// ✅ Correct - uses lamport + deviceId (deterministic)
const localOrder = `${local.lamportClock}-${local.deviceId}`;
const remoteOrder = `${remote.lamportClock}-${remote.deviceId}`;
const winner = localOrder > remoteOrder ? local : remote;
```

**Test determinism**:

```javascript
const results = [];
for (let i = 0; i < 100; i++) {
  const result = await resolver.resolveConflict(event1, event2);
  results.push(result.winner.deviceId);
}

const allSame = results.every((id) => id === results[0]);
console.log("Deterministic:", allSame); // Must be true
```

---

## Integration Issues

### Problem: Resolutions not persisted to IndexedDB

**Symptoms**:

- Conflicts resolved in memory
- IndexedDB conflicts table shows "pending"
- Page refresh loses resolutions

**Cause**: `logResolution()` not called or not updating database

**Solution**: Verify `logResolution()` implementation:

```typescript
async logResolution(conflict: Conflict, result: ResolutionResult) {
  // CRITICAL: Actually update the database
  await db.conflicts.update(conflict.id, {
    resolution: "resolved",
    resolvedValue: result.winner.payload,
    resolvedAt: new Date(),
  });

  console.log("Conflict resolved:", {
    entityId: conflict.entityId,
    strategy: result.strategy,
  });
}
```

**Verify in DevTools**:

1. Open Application → IndexedDB → conflicts
2. Find conflict by ID
3. Check `resolution` field = "resolved"
4. Check `resolvedAt` is a valid Date
5. Check `resolvedValue` matches winner payload

---

### Problem: Resolved conflicts not applied to entities

**Symptoms**:

- Conflict marked as "resolved"
- But entity still has old/wrong data
- Sync seems to work but data doesn't update

**Cause**: Missing `applyResolvedEvent()` call in sync processor

**Solution**: Ensure winner is applied after resolution:

```typescript
// In sync processor
if (detection.hasConflict) {
  const conflict = await logConflict(localEvent, remoteEvent);
  const resolution = await conflictResolutionEngine.resolveConflict(localEvent, remoteEvent);

  await conflictResolutionEngine.logResolution(conflict, resolution);

  // ← CRITICAL: Apply the winner
  await applyResolvedEvent(resolution.winner);
  return;
}
```

---

## Performance Issues

### Problem: Resolution slow with many conflicts

**Symptoms**:

- Sync takes seconds to complete
- Browser freezes during resolution
- Console shows many resolution calls

**Cause**: Sequential resolution instead of parallel

**Solution**: Batch resolve in parallel:

```typescript
// ❌ Slow - sequential
for (const conflict of conflicts) {
  const resolution = await resolver.resolveConflict(conflict.localEvent, conflict.remoteEvent);
  await logResolution(conflict, resolution);
}

// ✅ Fast - parallel
const resolutions = await Promise.all(
  conflicts.map(async (conflict) => {
    const resolution = await resolver.resolveConflict(conflict.localEvent, conflict.remoteEvent);
    await resolver.logResolution(conflict, resolution);
    return resolution;
  })
);
```

**Benchmark**:

```javascript
console.time("batch-resolution");
await Promise.all(conflicts.map(resolveAndLog));
console.timeEnd("batch-resolution");
// Should be <50ms for 100 conflicts
```

---

## TypeScript Issues

### Problem: Type error on ResolutionResult

**Symptoms**:

```
Property 'mergedPayload' does not exist on type 'ResolutionResult'
```

**Cause**: Optional field not marked properly

**Solution**: Update type definition:

```typescript
export interface ResolutionResult {
  winner: TransactionEvent;
  loser: TransactionEvent;
  strategy: ResolutionStrategy;
  reason: string;
  mergedPayload?: any; // ← Optional with ?
}
```

---

### Problem: "ConflictResolutionEngine is not a constructor"

**Symptoms**:

```
TypeError: ConflictResolutionEngine is not a constructor
at conflict-resolver.ts:5
```

**Cause**: Missing export or incorrect import

**Solution**: Verify export/import:

```typescript
// src/lib/conflict-resolver.ts
export class ConflictResolutionEngine {
  // ← Named export as class
  // ...
}

export const conflictResolutionEngine = new ConflictResolutionEngine(); // ← Singleton

// In consumer:
import { ConflictResolutionEngine, conflictResolutionEngine } from "./conflict-resolver";

// Use singleton (recommended)
const result = await conflictResolutionEngine.resolveConflict(local, remote);

// Or create new instance
const resolver = new ConflictResolutionEngine();
```

---

## Testing Issues

### Problem: Unit tests fail with "Cannot read property 'op' of undefined"

**Symptoms**:

```
TypeError: Cannot read property 'op' of undefined
at resolveConflict (conflict-resolver.ts:12)
```

**Cause**: Test data missing required fields

**Solution**: Ensure test events have all required fields:

```typescript
const validEvent = {
  id: "evt-1",
  entityId: "tx-1",
  entityType: "transaction",
  op: "update", // ← Required
  payload: { amount_cents: 100000 },
  vectorClock: { "device-A": 5 },
  lamportClock: 5, // ← Required for LWW
  deviceId: "device-A", // ← Required for tie-breaking
  actorUserId: "user-1",
  timestamp: Date.now(),
  idempotencyKey: "device-A-transaction-tx-1-5",
};
```

---

### Problem: Tests pass but real resolution fails

**Symptoms**:

- Unit tests all pass
- Real sync throws errors
- Console shows "Cannot resolve conflict"

**Cause**: Test events don't match real event structure

**Solution**: Test with real event structure from Dexie:

```javascript
// Get real event from database
const realEvent = await db.events.toArray().then((e) => e[0]);
console.log("Real event structure:", realEvent);

// Use in tests
const testLocal = {
  ...realEvent,
  lamportClock: 5,
  deviceId: "device-A",
};

const testRemote = {
  ...realEvent,
  lamportClock: 3,
  deviceId: "device-B",
};

const result = await resolver.resolveConflict(testLocal, testRemote);
```

---

## Edge Cases

### Problem: Resolution fails when events have same lamport and deviceId

**Symptoms**:

- Error: "Cannot determine winner"
- Events with identical ordering
- Tie-breaking fails

**Cause**: Same device created two events with same lamport (shouldn't happen)

**Solution**: Add safety check:

```typescript
private resolveRecordLWW(local, remote) {
  const localOrder = `${local.lamportClock}-${local.deviceId}`;
  const remoteOrder = `${remote.lamportClock}-${remote.deviceId}`;

  // Safety: if completely identical, prefer local
  if (localOrder === remoteOrder) {
    console.warn("Identical ordering detected, defaulting to local");
    return {
      winner: local,
      loser: remote,
      strategy: "record-lww",
      reason: "Identical ordering, local preferred",
    };
  }

  const winner = localOrder > remoteOrder ? local : remote;
  const loser = winner === local ? remote : local;

  return { winner, loser, strategy: "record-lww", reason: "..." };
}
```

---

### Problem: DELETE vs DELETE resolution unclear

**Symptoms**:

- Both events are DELETE
- Strategy shows "delete-wins" but unclear which delete won
- User confused about which delete "wins"

**Cause**: Both DELETEs are valid, need to pick one

**Solution**: Use lamport clock even for DELETE vs DELETE:

```typescript
private resolveDeleteConflict(local, remote) {
  // Both are DELETE? Use lamport clock
  if (local.op === "delete" && remote.op === "delete") {
    const winner = local.lamportClock > remote.lamportClock ? local : remote;
    const loser = winner === local ? remote : local;

    return {
      winner,
      loser,
      strategy: "delete-wins",
      reason: `Both DELETE - higher lamport (${winner.lamportClock}) wins`,
    };
  }

  // One is DELETE - that one wins
  const deleteEvent = local.op === "delete" ? local : remote;
  const otherEvent = deleteEvent === local ? remote : local;

  return {
    winner: deleteEvent,
    loser: otherEvent,
    strategy: "delete-wins",
    reason: "DELETE operation always takes precedence",
  };
}
```

---

## Data Integrity Issues

### Problem: Resolved value doesn't match winner payload

**Symptoms**:

- Winner selected correctly
- But resolvedValue in database is different
- Data corruption suspected

**Cause**: Payload mutated after resolution

**Solution**: Deep clone payload when logging:

```typescript
async logResolution(conflict, result) {
  await db.conflicts.update(conflict.id, {
    resolution: "resolved",
    resolvedValue: JSON.parse(JSON.stringify(result.winner.payload)),  // ← Deep clone
    resolvedAt: new Date(),
  });
}
```

---

### Problem: Loser data completely lost

**Symptoms**:

- Winner applied correctly
- But loser's unique data gone forever
- Users complain about lost edits

**Cause**: Record-level LWW replaces entire record

**Solution**: This is expected behavior for Phase B. Document for users:

```typescript
// Add to resolution reason
const reason =
  `Record-level LWW: ${winner === local ? "local" : "remote"} wins. ` +
  `Note: Entire record replaced (field-level merge available in Phase C)`;

// Optionally log loser for manual review
console.log("Conflict resolved - loser data:", result.loser.payload);
```

**Future**: Upgrade to field-level merge (Phase C) if users complain.

---

## Prevention Tips

1. **Test determinism**: Run resolution 100x with same input, verify same output
2. **Test commutativity**: resolve(A, B) should equal resolve(B, A)
3. **Always check DELETE first**: Before any other resolution logic
4. **Use lexicographic comparison**: String comparison for deviceId tie-breaking
5. **Log resolution details**: Include strategy, reason, winner/loser for debugging
6. **Deep clone payloads**: Prevent mutation issues
7. **Monitor resolution rate**: Alert if >10% of syncs result in conflicts

---

## Debugging Checklist

When resolution isn't working:

1. **Check lamport clocks exist**:

   ```javascript
   console.log("Local lamport:", localEvent.lamportClock);
   console.log("Remote lamport:", remoteEvent.lamportClock);
   ```

2. **Check operation types**:

   ```javascript
   console.log("Local op:", localEvent.op);
   console.log("Remote op:", remoteEvent.op);
   ```

3. **Check resolution logic order**:

   ```typescript
   // DELETE check MUST be first
   if (local.op === "delete" || remote.op === "delete") {
     /* ... */
   }
   // Then LWW
   return this.resolveRecordLWW(local, remote);
   ```

4. **Check database update**:

   ```javascript
   const conflict = await db.conflicts.get(conflictId);
   console.log("Resolution status:", conflict.resolution);
   ```

5. **Test with minimal case**:
   ```javascript
   const simple1 = { lamportClock: 5, deviceId: "A", op: "update" };
   const simple2 = { lamportClock: 3, deviceId: "B", op: "update" };
   const result = await resolver.resolveConflict(simple1, simple2);
   console.log("Winner:", result.winner === simple1 ? "local" : "remote");
   ```

---

## Quick Fixes

```javascript
// Reset all resolutions to pending
await db.conflicts.toCollection().modify({ resolution: "pending" });

// Check resolution logic
const result = await conflictResolutionEngine.resolveConflict(local, remote);
console.log("Strategy:", result.strategy);
console.log("Winner:", result.winner);
console.log("Reason:", result.reason);

// Verify database update
const updated = await db.conflicts.get(conflictId);
console.log("Updated:", updated);

// Test determinism
const results = Array.from({ length: 10 }, () => resolver.resolveConflict(local, remote));
console.log("All same:", new Set(results.map((r) => r.winner.deviceId)).size === 1);
```

---

**Remember**: Conflict resolution is deterministic by design. If resolution varies, there's a bug in the logic—fix it before deploying.
