# Chunk 024: Sync Processor

## At a Glance

- **Time**: 1 hour
- **Milestone**: Offline (6 of 7)
- **Prerequisites**: Chunk 023 (offline writes queue)
- **Can Skip**: No - required for sync functionality

## What You're Building

Background processor that syncs queued items to Supabase:

- Queue processor with retry logic
- Exponential backoff with jitter
- Error handling and logging
- Temporary ID replacement with server IDs
- Online/offline detection triggers
- Manual sync button functionality

## Why This Matters

The processor brings offline changes back online:

- **Data consistency**: Offline changes reach server
- **Conflict resolution**: Detects and resolves conflicts
- **Reliability**: Retries failed syncs automatically
- **Progress tracking**: Updates queue status
- **Multi-device**: Enables device synchronization

## Before You Start

Make sure you have:

- Chunk 023 completed (queue has items)
- Supabase configured and accessible
- Online/offline detection working
- Understanding of retry strategies

## What Happens Next

After this chunk:

- Queue automatically processes when online
- Failed items retry with backoff
- Temporary IDs replaced with server IDs
- Ready for Chunk 025 (sync UI indicators)

## Key Files Created

```
src/
├── lib/
│   └── sync/
│       ├── processor.ts           # Main sync processor
│       ├── retry.ts               # Exponential backoff logic
│       └── idMapping.ts           # Temp ID → Server ID mapping
└── hooks/
    └── useSyncProcessor.ts        # React hook for sync

```

## Features Included

### Queue Processing

- Process oldest items first (FIFO)
- Handle create, update, delete operations
- Replace temporary IDs with server IDs
- Update queue status (syncing → completed/failed)

### Retry Logic

- Exponential backoff: 1s, 2s, 4s, 8s...
- Max 3 retries by default
- Jitter to prevent thundering herd
- Failed items stay in queue for review

### Error Handling

- Network errors → retry
- Validation errors → fail immediately
- RLS errors → log and retry
- Unknown errors → log and retry

### Triggers

- On app focus/visibility change
- On online event (navigator.onLine)
- Manual sync button
- Periodic background sync (every 5 min)

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 176-224 (processItem, retry)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 517-627 (Background Sync Fallbacks)
- **Decisions**:
  - #62: Event sourcing from Phase A
  - #68: iOS Safari fallbacks
- **Architecture**: Offline-first with eventual consistency

## Technical Stack

- **Supabase**: Server database and RLS
- **TanStack Query**: Invalidate cache after sync
- **Navigator API**: Online/offline events
- **setTimeout**: Exponential backoff timing

## Design Patterns

### Queue Processor Pattern

```typescript
async function processQueue() {
  const items = await getPendingQueueItems();

  for (const item of items) {
    await processItem(item);
  }
}
```

### Retry with Exponential Backoff

```typescript
async function processWithRetry(item: QueueItem) {
  const delay = Math.pow(2, item.retry_count) * 1000; // 1s, 2s, 4s, 8s
  const jitter = Math.random() * 1000; // 0-1s random

  await sleep(delay + jitter);
  await processItem(item);
}
```

### Temporary ID Mapping

```typescript
// Track temp → server ID mappings
const idMap = new Map<string, string>();

// After syncing entity with temp ID
idMap.set("temp-abc123", "real-uuid-456");

// Update references in subsequent operations
if (transaction.account_id.startsWith("temp-")) {
  transaction.account_id = idMap.get(transaction.account_id);
}
```

## Critical Concepts

**Idempotency**:

- Server checks idempotency key
- Duplicate operations ignored
- Safe to retry any operation

**Order Matters**:

- Process creates before updates
- Process deletes last
- Maintain per-entity order

**ID Replacement**:

- Track temp → server mappings
- Update references in payload
- Clear mappings after session

**Status Transitions**:

```
queued → syncing → completed
       ↓ (error)
     failed → queued (retry)
```

---

**Ready?** → Open `instructions.md` to begin
