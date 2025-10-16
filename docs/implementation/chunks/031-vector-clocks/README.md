# Chunk 031: Vector Clocks

## At a Glance

- **Time**: 2 hours
- **Milestone**: Multi-Device Sync (6 of 10)
- **Prerequisites**: Chunk 030 (event generation working)
- **Can Skip**: No - required for conflict detection in Phase B

## What You're Building

Per-entity vector clocks for advanced conflict detection:

- VectorClock interface and utility functions
- Vector clock comparison (concurrent/ahead/equal/behind)
- Vector clock merging for conflict resolution
- Lamport clock integration per entity
- Update event generation to include vector clocks
- Test vector clock logic with multi-device scenarios

## Why This Matters

Vector clocks are the **foundation of Phase B sync** (Decision #85). They enable:

- **Conflict detection**: Determine if two edits conflict or are causally ordered
- **Per-entity tracking**: Each entity maintains its own clock (reduces contention)
- **Deterministic resolution**: Clear rules for which version wins
- **Multi-device sync**: Track changes across devices without central coordination
- **Debugging**: Understand causality and event ordering

Without vector clocks, the system can't distinguish between:

- Sequential edits (A then B) → No conflict
- Concurrent edits (A and B simultaneously) → Conflict!

This chunk implements the algorithm from SYNC-ENGINE.md lines 279-363.

## Before You Start

Make sure you have:

- Chunk 030 completed (event generation hooks in place)
- transaction_events table with lamport_clock and vector_clock columns
- Dexie events table includes vector_clock field
- DeviceManager providing stable device IDs
- TypeScript knowledge of Record types and comparisons

## What Happens Next

After this chunk:

- All events include per-entity vector clocks
- Can compare any two versions of an entity
- Can detect concurrent edits across devices
- Ready for conflict detection (chunk 032)
- Foundation for deterministic conflict resolution
- Multi-device sync with proper causality tracking

## Key Files Created

```
src/
├── lib/
│   ├── vector-clock.ts         # Vector clock utilities
│   └── vector-clock.test.ts    # Comprehensive unit tests
└── types/
    └── sync.ts                  # VectorClock type definition
```

## Features Included

### Vector Clock Interface

```typescript
interface VectorClock {
  [deviceId: string]: number; // Per-device clock value
}
```

### Comparison Logic

```typescript
compareVectorClocks(v1, v2) → "concurrent" | "local-ahead" | "remote-ahead" | "equal"
```

### Merge Operation

```typescript
mergeVectorClocks(v1, v2) → VectorClock // Element-wise max
```

### Lamport Clock

```typescript
// Per-entity monotonic counter
getLamportClock(entityId) → number
incrementLamportClock(entityId) → number
```

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 279-363 (per-entity conflict resolution)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 99-128 (event structure with vector clocks)
- **Decisions**:
  - #62: Event sourcing from Phase A
  - #77: Deterministic conflict resolution
  - #85: Phase B uses record-level LWW with vector clocks for detection
- **Architecture**: Three-layer storage with event sourcing

## Technical Stack

- **TypeScript**: Type-safe vector clock operations
- **Vitest**: Unit testing for clock comparison logic
- **Dexie**: Local storage of vector clocks
- **Supabase**: Cloud storage of events with clocks

## Design Patterns

### Per-Entity Vector Clocks

```typescript
// Each entity has its own independent vector clock
transaction_A: { device1: 5, device2: 3 }
transaction_B: { device1: 2, device2: 7 }
// No relation between A and B clocks
```

### Deterministic Comparison

```typescript
// Vector clock comparison algorithm
// v1 >= v2 for all devices → v1 ahead
// v2 >= v1 for all devices → v2 ahead
// Mixed → concurrent (conflict!)
// Equal → same version
```

### Clock Merging

```typescript
// Take maximum of each device clock
merge(
  { device1: 5, device2: 3 },
  { device1: 3, device2: 7 }
)
→ { device1: 5, device2: 7 }
```

## Algorithm Deep Dive

### Vector Clock Comparison

From SYNC-ENGINE.md lines 340-362:

```typescript
function compareVectorClocks(v1, v2): ComparisonResult {
  const allDevices = new Set([...Object.keys(v1), ...Object.keys(v2)]);

  let v1Ahead = false;
  let v2Ahead = false;

  for (const device of allDevices) {
    const t1 = v1[device] || 0;
    const t2 = v2[device] || 0;

    if (t1 > t2) v1Ahead = true;
    if (t2 > t1) v2Ahead = true;
  }

  if (v1Ahead && v2Ahead) return "concurrent"; // Conflict!
  if (v1Ahead) return "local-ahead";
  if (v2Ahead) return "remote-ahead";
  return "equal";
}
```

**Interpretation**:

- **Concurrent**: Device A made changes device B doesn't have, AND vice versa
- **Local ahead**: Device A has all of device B's changes + more
- **Remote ahead**: Device B has all of device A's changes + more
- **Equal**: Same version

### Lamport Clock Integration

Each entity maintains a monotonic counter:

```typescript
// Entity tx-123 events:
Event 1: lamport_clock = 1
Event 2: lamport_clock = 2
Event 3: lamport_clock = 3

// Lamport ensures total ordering within an entity
```

Combined with device ID for tie-breaking:

```typescript
if (lamportA > lamportB) return A;
if (lamportA < lamportB) return B;
if (deviceA > deviceB) return A; // Lexicographic tie-break
return B;
```

## Performance Characteristics

- **Clock storage**: ~50 bytes per vector clock (5 devices × 10 bytes)
- **Comparison**: O(D) where D = number of devices (typically 2-5)
- **Merge**: O(D) element-wise maximum
- **Memory**: Negligible (<1KB for typical household)

For 10,000 events × 5 devices:

- Storage: ~500KB
- Comparison: <1ms
- No performance impact

## Testing Strategy

### Unit Tests (Vitest)

- Compare identical clocks → "equal"
- Compare causally ordered clocks → "ahead"
- Compare concurrent clocks → "concurrent"
- Merge clocks with overlapping devices
- Merge clocks with disjoint devices
- Lamport clock increments correctly per entity

### Integration Tests

- Create event on device A → vector clock includes device A
- Create event on device B → vector clock includes device B
- Concurrent edits → detect with vector clock comparison
- Sequential edits → no conflict detected

### Property-Based Tests

- Clock comparison is reflexive: compare(A, A) = "equal"
- Clock comparison is consistent: compare(A, B) opposite of compare(B, A)
- Clock merge is commutative: merge(A, B) = merge(B, A)
- Clock merge is idempotent: merge(A, A) = A

---

**Ready?** → Open `instructions.md` to begin
