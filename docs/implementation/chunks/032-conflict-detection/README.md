# Chunk 032: Conflict Detection

## At a Glance

- **Time**: 1 hour
- **Milestone**: Multi-Device Sync (7 of 10)
- **Prerequisites**: Chunk 031 (vector clocks implemented)
- **Can Skip**: No - required for automatic conflict resolution

## What You're Building

Conflict detection system using vector clocks:

- detectConflict() function for sync operations
- Integration with sync queue processor
- Conflict logging for transparency
- UI indicators for detected conflicts
- Test scenarios for concurrent edits

## Why This Matters

Conflict detection is the **gateway to Phase B sync**. It enables:

- **Automatic detection**: Know when two devices edit the same thing
- **Transparency**: Log conflicts for user review
- **Deterministic resolution**: Feed conflicts to resolution engine
- **Debugging**: Understand sync issues through conflict logs
- **Trust**: Users see what the system is doing

Without detection, conflicts silently overwrite data (data loss!). This chunk prevents that.

## Before You Start

Make sure you have:

- Chunk 031 completed (vector clock utilities working)
- compareVectorClocks() function tested
- Sync queue processor exists (from chunk 024)
- Events include vector clocks

## What Happens Next

After this chunk:

- Conflicts detected automatically during sync
- Conflicts logged to IndexedDB for review
- UI shows conflict indicators
- Ready for resolution engine (chunk 033)
- Multi-device sync safe (no silent overwrites)

## Key Files Created

```
src/
├── lib/
│   ├── conflict-detector.ts         # Conflict detection logic
│   └── conflict-detector.test.ts    # Unit tests
├── stores/
│   └── conflictStore.ts              # Zustand store for conflicts
└── components/
    └── ConflictIndicator.tsx         # UI component (optional)
```

## Features Included

### Conflict Detection

```typescript
detectConflict(localEvent, remoteEvent) → boolean
```

### Conflict Logging

```typescript
logConflict({ entityType, entityId, local, remote, detected }) → Promise<void>
```

### Conflict Store

```typescript
// Zustand store
interface ConflictStore {
  conflicts: Conflict[];
  addConflict: (conflict: Conflict) => void;
  clearConflicts: () => void;
}
```

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 279-363 (conflict resolution)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 265-565 (sync issues UI)
- **Decisions**: #77 (deterministic conflict resolution)

## Technical Stack

- **TypeScript**: Type-safe conflict detection
- **Vitest**: Unit tests for detection logic
- **Zustand**: Conflict state management
- **Dexie**: Conflict persistence

## Design Patterns

### Conflict Detection Pattern

```typescript
// During sync, check for conflicts
const comparison = compareVectorClocks(local.vectorClock, remote.vectorClock);

if (comparison === "concurrent") {
  // Conflict detected!
  await logConflict({ local, remote });
  await resolveConflict(local, remote);
}
```

### Conflict Logging Pattern

```typescript
// Store conflict for user review
await db.conflicts.add({
  entityType: "transaction",
  entityId: "tx-123",
  detectedAt: new Date(),
  local: localVersion,
  remote: remoteVersion,
  resolution: "pending",
});
```

---

**Ready?** → Open `instructions.md` to begin
