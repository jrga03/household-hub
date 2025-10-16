# Chunk 023: Offline Writes Queue

## At a Glance

- **Time**: 2 hours
- **Milestone**: Offline (5 of 7)
- **Prerequisites**: Chunk 021 (offline writes), Chunk 022 (sync queue schema)
- **Can Skip**: No - required for sync functionality

## What You're Building

Integration layer connecting offline writes to sync queue:

- Modify offline mutations to add items to sync queue
- Event generation with idempotency keys
- Lamport clock tracking per entity
- Vector clock initialization (Phase B ready)
- Atomic operations (IndexedDB write + queue insert)
- Testing complete offline → queue flow

## Why This Matters

This chunk completes the offline write path:

- **Durability**: Changes tracked in database queue
- **Sync-ready**: Processor (chunk 024) can process queue
- **Idempotency**: Prevents duplicate syncs
- **Auditability**: Complete event history
- **Resilience**: Survives app crashes and restarts

## Before You Start

Make sure you have:

- Chunk 021 completed (offline write functions)
- Chunk 022 completed (sync_queue table exists)
- Supabase client configured
- Understanding of event sourcing concepts

## What Happens Next

After this chunk:

- Offline writes automatically add to sync queue
- Each mutation has idempotency key
- Lamport clocks increment per entity
- Ready for Chunk 024 (sync processor)
- **Note**: Sync queue enables logout data retention check (enhanced in chunk 036)

## Key Files Created/Modified

```
src/
├── lib/
│   ├── offline/
│   │   ├── transactions.ts      # Modified: add to queue
│   │   ├── accounts.ts          # Modified: add to queue
│   │   ├── categories.ts        # Modified: add to queue
│   │   └── syncQueue.ts         # NEW: Queue operations
│   └── sync/
│       ├── idempotency.ts       # NEW: Generate keys
│       ├── lamportClock.ts      # NEW: Clock management
│       └── vectorClock.ts       # NEW: Vector clock (Phase B)
```

## Features Included

### Queue Integration

- Add to queue after successful IndexedDB write
- Atomic transactions (both succeed or both fail)
- Retry logic if queue insertion fails

### Idempotency Keys

```typescript
// Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
"device-abc-transaction-tx123-5";
```

- Prevents duplicate event processing
- Deterministic key generation
- Per-entity uniqueness

### Lamport Clock Management

- Increment per entity (not global)
- Stored in IndexedDB meta table
- Used for conflict detection

### Vector Clock Initialization

- Per-entity vector clocks
- Device-specific clock values
- Ready for Phase B conflict resolution

### Event Structure

```typescript
interface SyncQueueOperation {
  op: "create" | "update" | "delete";
  payload: any;
  idempotencyKey: string;
  lamportClock: number;
  vectorClock: Record<string, number>;
}
```

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 228-277 (Idempotency Keys)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 100-130 (Event Structure)
- **Decisions**:
  - #62: Event sourcing from Phase A
  - #77: Deterministic conflict resolution
- **Architecture**: Event sourcing with per-entity clocks

## Technical Stack

- **Supabase**: Sync queue storage and RLS
- **IndexedDB**: Lamport clock persistence
- **nanoid**: Event ID generation
- **TypeScript**: Type-safe event operations

## Design Patterns

### Atomic Write Pattern

```typescript
async function createWithQueue(data) {
  // 1. Write to IndexedDB
  await db.transactions.add(data);

  try {
    // 2. Add to sync queue
    await addToSyncQueue(operation);
  } catch (error) {
    // Rollback IndexedDB on queue failure
    await db.transactions.delete(data.id);
    throw error;
  }
}
```

### Idempotency Key Pattern

```typescript
function generateIdempotencyKey(
  deviceId: string,
  entityType: string,
  entityId: string,
  lamportClock: number
): string {
  return `${deviceId}-${entityType}-${entityId}-${lamportClock}`;
}
```

### Lamport Clock Pattern

```typescript
// Per-entity clock management
async function getNextLamportClock(entityId: string): Promise<number> {
  const key = `lamport-${entityId}`;
  const current = (await db.meta.get(key))?.value || 0;
  const next = current + 1;
  await db.meta.put({ key, value: next });
  return next;
}
```

## Critical Concepts

**Atomicity**:

- IndexedDB write and queue insert must both succeed
- Rollback IndexedDB if queue fails
- Prevents inconsistent state

**Idempotency**:

- Same key = same event
- Server deduplicates by key
- Critical for retry logic

**Per-Entity Clocks**:

- Each entity has its own Lamport clock
- Enables independent conflict resolution
- Scales better than global clock

**Vector Clocks (Phase B)**:

- Track per-device clock values
- Enable concurrent edit detection
- Initialized now, used in Phase B

---

**Ready?** → Open `instructions.md` to begin
