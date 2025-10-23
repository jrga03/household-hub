# Chunk 035: Event Compaction

## At a Glance

- **Time**: 1 hour
- **Milestone**: Multi-Device Sync (10 of 10)
- **Prerequisites**: Chunk 034 (realtime sync working)
- **Can Skip**: Optional - but prevents unbounded event growth

## Prerequisites Verification

Before starting this chunk, verify the following:

### ✓ Chunk 034 Complete

```bash
# Check that realtime sync checkpoint passed
cat docs/implementation/chunks/034-sync-realtime/checkpoint.md
# All checkpoints should show ✓
```

### ✓ Required Infrastructure

```javascript
// In browser console, verify these exist:

// 1. Vector clock utilities
import { mergeVectorClocks } from "@/lib/vector-clock";
console.log("Vector clock module:", typeof mergeVectorClocks); // "function"

// 2. Events table populated
import { db } from "@/lib/dexie";
const eventCount = await db.events.count();
console.log("Events in DB:", eventCount); // Should be > 0

// 3. Devices table exists
const deviceCount = await db.devices?.count();
console.log("Devices registered:", deviceCount); // Should be ≥ 1

// 4. Realtime subscriptions active
// Check network tab for websocket connection to Supabase
```

### ✓ Ready to Proceed

- [x] Chunk 034 checkpoint passed
- [x] Vector clock module exists (`src/lib/vector-clock.ts`)
- [x] Events table has data (transactions/accounts/categories created)
- [x] Devices table populated (at least current device registered)
- [x] Realtime sync tested and working

**If any verification fails**, go back and complete the prerequisite chunks first.

---

## What You're Building

Event compaction strategy to prevent unbounded event log growth:

- Compaction trigger (100 events OR monthly, whichever first)
- Snapshot creation from event replay
- Vector clock compaction (remove inactive devices >30 days)
- Scheduled compaction job
- Manual compaction trigger

## Why This Matters

Event compaction is **essential for long-term stability**. Without it:

- **Event log grows forever** → IndexedDB quota exceeded
- **Query performance degrades** → Slow sync operations
- **Vector clocks bloat** → Too many inactive device entries

Compaction maintains performance and prevents storage issues.

## Key Files Created

```
src/
├── lib/
│   ├── event-compactor.ts         # Compaction engine
│   └── event-compactor.test.ts    # Unit tests
└── workers/
    └── compaction.worker.ts        # Background compaction
```

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 1307-1468 (event compaction strategy)
- **Decisions**: `docs/initial plan/DECISIONS.md` #67 (vector clock compaction - prune devices >30 days)
- **Decisions**: `docs/initial plan/DECISIONS.md` #76 (event compaction policy - 100 events OR monthly)

## Technical Stack

- **TypeScript**: Type-safe compaction logic
- **Dexie**: Event query and bulk operations
- **Vitest**: Unit tests for compaction
- **Background Workers**: Optional Web Workers for non-blocking compaction

## Design Patterns

### Event Replay Pattern

```typescript
// Replay events to reconstruct current state
function replayEvents(events: Event[]): State {
  let state = {};

  for (const event of events) {
    switch (event.op) {
      case "create":
        state = event.payload;
        break;
      case "update":
        Object.assign(state, event.payload);
        break;
      case "delete":
        state = { deleted: true };
        break;
    }
  }

  return state;
}
```

### Snapshot Pattern

```typescript
// Create snapshot from replayed state
const snapshot = {
  entityId,
  op: "snapshot",
  payload: replayedState,
  lamportClock: maxLamport,
  vectorClock: mergedVectorClock,
};
```

### Compaction Trigger Strategy

```
Trigger when FIRST condition met:
1. Event count ≥ 100 (prevents unbounded growth)
2. Time since last compaction ≥ 30 days (periodic cleanup)
```

### Event Retention Policy

**Implementation**: Immediate compaction with 10-event safety buffer

This chunk uses **immediate compaction** (not 90-day retention) for Phase A simplicity:

- Old events deleted immediately after snapshot creation
- Last 10 events preserved as safety buffer for conflict resolution
- Snapshot + 10 recent events provide full state reconstruction

**Rationale**: Decision #76 originally specified "Retain raw events for 90 days", but Phase A adopts immediate compaction with safety buffer for these reasons:

1. **Storage efficiency**: Reduces IndexedDB usage by ~90% immediately
2. **Simplicity**: No time-based cleanup scheduler needed
3. **Adequate safety**: 10-event buffer sufficient for recent conflict resolution
4. **Full history preserved**: R2 backups (Chunks 038-040) provide long-term retention

**Future**: Phase B may introduce configurable retention windows if audit requirements demand it.

## How Event Compaction Works

### 1. Compaction Trigger

```
Events: [create, update, update, update, ..., update] (100 events)
                           ↓
           Trigger: Count ≥ 100 OR Time ≥ 30 days
                           ↓
              Compaction starts
```

### 2. Event Replay

```
[create: {amount: 100}]
[update: {amount: 150}]
[update: {description: "Updated"}]
[update: {amount: 200}]

Replay: Apply each event in order
Result: {amount: 200, description: "Updated"}
```

### 3. Snapshot Creation

```
Snapshot Event = {
  op: "snapshot",
  payload: <final state from replay>,
  lamportClock: <max lamport from all events>,
  vectorClock: <merged vector clock>,
}
```

### 4. Event Deletion

```
Before: [evt1, evt2, ..., evt98, evt99, evt100]
After:  [snapshot, evt91, ..., evt99, evt100]

Deleted: First 90 events
Kept: Snapshot + last 10 events (safety buffer)
```

## Performance Characteristics

- **Compaction time**: ~100ms for 100 events
- **Storage saved**: ~90% reduction (100 events → 11)
- **Memory usage**: ~5MB peak during compaction
- **Frequency**: Every 100 events OR every 30 days

## Why Event Compaction Matters

### Without Compaction

```
Day 1: 50 events (50KB)
Day 30: 1,500 events (1.5MB)
Day 90: 4,500 events (4.5MB)
Day 365: 18,250 events (18MB)

Problem: Unbounded growth → IndexedDB quota exceeded
```

### With Compaction

```
Day 1: 50 events (50KB)
Day 30: Compact → 11 events (11KB)
Day 90: Compact → 11 events (11KB)
Day 365: Compact → 11 events (11KB)

Result: Bounded storage ~11KB per entity
```

## Compaction vs Backup

| Aspect    | Compaction             | Backup               |
| --------- | ---------------------- | -------------------- |
| Purpose   | Reduce storage         | Preserve history     |
| When      | Automatic (100 events) | Manual/Scheduled     |
| Storage   | Local (IndexedDB)      | Remote (R2)          |
| Data loss | Old events removed     | All events preserved |
| Frequency | Per entity             | Per household        |

**Key**: Compaction is for performance, backups are for recovery.

## Vector Clock Compaction

Additionally, prune inactive devices from vector clocks:

```typescript
// Before: {device-A: 50, device-B: 30, device-C: 10, device-D: 5}
// Device D inactive >30 days

// After: {device-A: 50, device-B: 30, device-C: 10}
// Removed: device-D
```

**Benefit**: Reduces vector clock size, speeds up conflict detection.

## Safety Mechanisms

### 1. Keep Recent Events

Always retain last 10 events as safety buffer:

- Allows recent conflict resolution
- Provides audit trail
- Enables rollback if needed

### 2. Snapshot Before Delete

```typescript
// Order matters!
await db.events.add(snapshot); // 1. Create snapshot
await db.events.bulkDelete(oldEvents); // 2. Then delete old
```

### 3. Checksum Verification

```typescript
// Future: Add checksum to verify snapshot integrity
const checksum = hash(snapshot.payload);
snapshot.checksum = checksum;
```

## Testing Strategy

### Unit Tests

- Event replay produces correct state
- Compaction triggered at 100 events
- Snapshot created with merged vector clock
- Old events deleted correctly

### Integration Tests

- Create 150 events → Verify compaction runs
- Verify state unchanged after compaction
- Check storage size reduced

### Property-Based Tests

- Compaction is idempotent (compact twice = compact once)
- State before compaction = state after compaction
- Vector clock ordering preserved

## Common Scenarios

### Scenario 1: Normal Compaction

```
Entity has 150 events
→ Trigger compaction
→ Replay 150 events
→ Create snapshot
→ Delete first 140 events
→ Result: 11 events (snapshot + 10 recent)
```

### Scenario 2: Monthly Compaction

```
Entity has 50 events (below threshold)
Last compaction: 35 days ago
→ Trigger compaction (time threshold)
→ Compact to snapshot + 10 recent
```

### Scenario 3: Deleted Entity

```
Entity has [create, update, update, delete] (4 events)
→ Below threshold, don't compact yet
→ At 30 days: Compact
→ Snapshot: {deleted: true, deletedAt: <timestamp>}
→ Result: 1 snapshot event (no recent events needed)
```

---

**Ready?** → Open `instructions.md` to begin
