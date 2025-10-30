# Chunk 033: Conflict Resolution

## At a Glance

- **Time**: 1.5 hours
- **Milestone**: Multi-Device Sync (8 of 10)
- **Prerequisites**: Chunk 032 (conflict detection working)
- **Can Skip**: No - required for automatic sync

## What You're Building

Record-level Last-Write-Wins conflict resolution (Phase B approach per Decision #86):

- ConflictResolutionEngine class
- Record-level LWW using server timestamps
- Special case handling (DELETE-wins implemented; field-level rules deferred to Phase C)
- Resolution logging for transparency
- Integration with sync processor
- Field-level merge rules documented (Phase C future)

## Why This Matters

Conflict resolution is the **heart of Phase B sync** (Decision #86). It enables:

- **Automatic resolution**: No user intervention needed for most conflicts
- **Deterministic**: Same conflict always resolves the same way
- **Transparent**: Users see what was resolved and how
- **Data integrity**: No silent data loss
- **Multi-device**: Devices converge to same state

Phase B uses **record-level LWW** (simpler than field-level). Field-level merge deferred to Phase C or "when needed" per Decision #86.

## Before You Start

Make sure you have:

- Chunk 032 completed (conflict detection working)
- Conflicts logged to IndexedDB
- Transaction events include lamport clocks (logical timestamps)
- Understanding of LWW resolution

## What Happens Next

After this chunk:

- Conflicts resolve automatically
- Resolution logged for review
- Sync processor handles conflicts gracefully
- Ready for realtime sync (chunk 034)
- Multi-device sync fully functional

## Key Files Created

```
src/
├── lib/
│   ├── conflict-resolver.ts         # Resolution engine
│   └── conflict-resolver.test.ts    # Unit tests
└── types/
    └── resolution.ts                 # Resolution types
```

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 365-514 (conflict resolution matrix)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 279-363 (per-entity resolution)
- **Decisions**:
  - #77: Deterministic conflict resolution
  - #86: Phase B uses record-level LWW, field-level deferred to Phase C

## Technical Stack

- **TypeScript**: Type-safe resolution engine
- **Vitest**: Unit tests for resolution logic
- **Dexie**: Conflict persistence and updates
- **Lamport Clocks**: Total ordering for deterministic resolution

## Design Patterns

### Record-Level Last-Write-Wins

```typescript
// Phase B: Entire record replaced by winner
const resolution = resolveConflict(local, remote);
await applyEntity(resolution.winner.payload); // Whole record

// Phase C (future): Field-by-field merge
const merged = mergeFields(local.payload, remote.payload);
await applyEntity(merged); // Merged fields
```

### Deterministic Tie-Breaking

```typescript
// Use lamport clock + device ID for total ordering
const localOrder = `${localEvent.lamportClock}-${localEvent.deviceId}`;
const remoteOrder = `${remoteEvent.lamportClock}-${remoteEvent.deviceId}`;

// Lexicographic comparison ensures determinism
const winner = localOrder > remoteOrder ? localEvent : remoteEvent;
```

### DELETE-Wins Strategy

```typescript
// DELETE operations have special priority
if (localEvent.op === "delete" || remoteEvent.op === "delete") {
  return resolveDeleteConflict(localEvent, remoteEvent);
}

// Prevents "zombie" entities from resurrecting
```

## Algorithm Deep Dive

### Resolution Decision Tree

```
1. Is either operation a DELETE?
   YES → DELETE wins (regardless of timestamp)
   NO → Continue to step 2

2. Compare Lamport clocks
   Local > Remote → Local wins
   Remote > Local → Remote wins
   Equal → Continue to step 3

3. Tie-break with Device ID (lexicographic)
   device-A vs device-B → device-B wins
   (Ensures all devices converge to same result)
```

### Why Record-Level LWW?

**Phase B Simplicity** (Decision #86):

- **Pros**:
  - Simple implementation (~100 LOC)
  - Fast resolution (<1ms)
  - Deterministic and testable
  - Good enough for 95% of conflicts

- **Cons**:
  - Entire record replaced (not field-by-field)
  - Some data loss in rare cases
  - Less granular than field-level merge

**When to Upgrade to Field-Level** (Phase C):

- User complaints about lost data
- Analytics show high conflict rate (>10%)
- Need for special field rules (e.g., notes concatenation)
- Multi-user editing same transaction common

## Performance Characteristics

- **Resolution time**: <1ms per conflict
- **Memory**: ~1KB per resolution (logged)
- **Storage**: Resolutions kept for 90 days (then pruned)
- **Throughput**: 1000+ resolutions/second

## Testing Strategy

### Unit Tests (Vitest)

Test cases:

- Local has higher lamport clock → local wins
- Remote has higher lamport clock → remote wins
- Equal lamport clocks → device ID tie-breaks
- DELETE vs UPDATE → DELETE wins
- DELETE vs DELETE → higher lamport wins

### Integration Tests

- Create conflict on device A
- Sync to device B
- Verify resolution converges to same state
- Check resolution logged correctly

### Property-Based Tests

- Resolution is deterministic (same input → same output)
- Resolution is commutative (resolve(A, B) = resolve(B, A))
- Resolution converges (all devices reach same state)

## Common Scenarios

### Scenario 1: Concurrent Amount Edit

```
Device A: Edit transaction amount to ₱1,000 (lamport 5)
Device B: Edit same transaction to ₱2,000 (lamport 3)

Resolution: Device A wins (higher lamport)
Result: Amount = ₱1,000
```

### Scenario 2: Edit vs Delete

```
Device A: Edit transaction description (lamport 10)
Device B: Delete same transaction (lamport 5)

Resolution: DELETE wins (special priority)
Result: Transaction deleted
```

### Scenario 3: Simultaneous Edits with Tie

```
Device A: Edit at lamport 5, deviceId "device-abc"
Device B: Edit at lamport 5, deviceId "device-xyz"

Resolution: Device B wins (device-xyz > device-abc lexicographically)
Result: Device B's changes applied
```

## Extension Points for Phase C

When upgrading to field-level merge:

1. **Add field resolver map**:

   ```typescript
   const fieldResolvers: FieldResolverMap = {
     amount_cents: lastWriteWins,
     status: clearedWins,
     notes: concatenate,
     deleted: deleteWins,
   };
   ```

2. **Implement mergeFields()**:

   ```typescript
   function mergeFields(local, remote, resolvers) {
     return Object.keys({ ...local, ...remote }).reduce((merged, field) => {
       merged[field] = resolvers[field](local[field], remote[field]);
       return merged;
     }, {});
   }
   ```

3. **Update resolution logic**:
   ```typescript
   const mergedPayload = mergeFields(localEvent.payload, remoteEvent.payload, fieldResolvers);
   ```

See `conflict-resolution-rules.md` for complete field-level spec.

---

**Ready?** → Open `instructions.md` to begin
