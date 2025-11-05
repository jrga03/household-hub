# Offline Operations (`/src/lib/offline/`)

## Purpose

The offline module implements **offline-first data operations** that work without network connectivity. All mutations write to IndexedDB first and queue for background sync to Supabase. This enables the app to function fully offline with automatic sync when online.

## Architecture Pattern

```
┌──────────────────────────────────────────────────┐
│  User Action (Create/Update/Delete)             │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│  1. Write to IndexedDB (immediate, local)       │
│     - db.transactions.put(entity)                │
│     - User sees change instantly                 │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│  2. Add to Sync Queue (background task)         │
│     - supabase.from('sync_queue').insert()       │
│     - Includes idempotency key                   │
│     - Lamport + vector clocks                    │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│  3. Sync Processor (when online)                │
│     - Picks up queued items                      │
│     - Syncs to Supabase cloud                    │
│     - Updates IndexedDB with server IDs          │
└──────────────────────────────────────────────────┘
```

**Key Principle:** Local-first, always responsive. Network sync happens asynchronously in background.

## Contents

### Core Modules

- **`syncQueue.ts`** (13.5KB) - Sync queue management
  - Add operations to queue
  - Query pending items
  - Track queue counts
  - **Lines 1-29 have EXCELLENT inline documentation** ⭐

- **`transactions.ts`** (15.2KB) - Offline transaction operations
  - Create transaction → IndexedDB + queue
  - Update transaction → IndexedDB + queue
  - Delete transaction → IndexedDB + queue
  - Handles transfer transactions (paired creates)

- **`accounts.ts`** (9.8KB) - Offline account operations
  - Create/update/delete accounts
  - Validates account data
  - Manages account relationships

- **`categories.ts`** (9.7KB) - Offline category operations
  - Create/update/delete categories
  - Handles parent-child relationships
  - Validates category hierarchy

- **`cacheManager.ts`** (2.2KB) - Cache management
  - IndexedDB cache invalidation
  - Last sync timestamp tracking
  - Cache freshness checks

- **`types.ts`** (2.7KB) - Type definitions
  - Offline operation types
  - Queue item types
  - Error response types

### Test Files

- **`syncQueue.test.ts`** (23.7KB) - Comprehensive sync queue integration tests
- **`syncQueue.test.README.md`** ✅ - Test setup guide (IndexedDB polyfill, fake timers)
- **`transactions.test.ts`** - Transaction operation tests

## Key Concepts

### 1. Sync Queue State Machine

Queue items progress through these states:

```
queued    [Initial state, ready to sync]
  ↓
syncing   [Being processed by sync processor]
  ↓
  ├──→ completed   [Successfully synced, can be removed]
  │
  └──→ failed      [Error occurred]
        ↓
      queued       [Retry with exponential backoff]
```

**State Tracking:**

- `status`: Current state (queued | syncing | completed | failed)
- `retry_count`: Number of retry attempts
- `last_retry_at`: Timestamp of last retry
- `error_message`: Error details if failed

### 2. Idempotency Keys

Every operation gets a unique idempotency key to ensure exactly-once processing:

**Format:**

```
${deviceId}-${entityType}-${entityId}-${lamportClock}
```

**Example:**

```
"device-abc123-transaction-txn-456-42"
```

**Benefits:**

- Network retries won't duplicate data
- Server can detect and reject duplicates
- Safe to retry failed operations

**Generation:** Automatic via `generateIdempotencyKey()` in sync queue

### 3. Lamport Clocks

Each entity has a per-device lamport clock (monotonic counter):

**Purpose:**

- Order operations on same entity
- Part of idempotency key
- Simpler than vector clocks for Phase A

**Increment:** Every local change increments clock:

```
Entity "txn-123":
  Operation 1: lamport = 1
  Operation 2: lamport = 2
  Operation 3: lamport = 3
```

**Storage:** Tracked in sync queue metadata

### 4. Vector Clocks (Phase B)

Per-entity vector clocks track causality across devices:

**Structure:**

```json
{
  "device-123": 5,
  "device-456": 3
}
```

**Purpose:**

- Detect concurrent edits (conflicts)
- Determine causality (A happened before B)
- Enable deterministic conflict resolution

**See:** [../sync/README.md](../sync/README.md) for vector clock details

### 5. Rollback Strategy

If queue insertion fails, changes are rolled back:

**Pattern:**

```typescript
// 1. Write to IndexedDB
await db.transactions.put(transaction);

// 2. Add to sync queue (may fail if offline)
const result = await addToSyncQueue(/* ... */);

// 3. If queue fails, rollback IndexedDB change
if (!result.success) {
  await db.transactions.delete(transaction.id);
  return { success: false, error: result.error };
}
```

**Why:** Maintains consistency between IndexedDB and sync queue

### 6. Graceful Error Handling

All operations return result objects instead of throwing:

**Pattern:**

```typescript
type Result<T> = { success: true; data: T } | { success: false; error: string };
```

**Benefits:**

- Predictable error handling
- Easy to check success/failure
- No try-catch needed in callers

## Core Operations

### Sync Queue Operations (`syncQueue.ts`)

**Add to Queue:**

- `addToSyncQueue(operation, entityType, entityId, payload, userId)`
- Generates idempotency key
- Increments lamport clock
- Updates vector clock
- Inserts into `sync_queue` table (Supabase)

**Query Queue:**

- `getPendingQueueItems(userId, deviceId)` - Get all queued items
- `getQueueCount(userId, deviceId)` - Count pending items
- `getFailedQueueItems(userId, deviceId)` - Get failed items

**Update Status:**

- `updateSyncQueueStatus(id, status)` - Change item status
- `removeSyncQueueItem(id)` - Remove completed item

**Clear Queue:**

- `clearCompletedQueueItems(userId, deviceId)` - Cleanup completed

### Transaction Operations (`transactions.ts`)

**Create:**

- `createOfflineTransaction(transaction)` - Create locally
  - Writes to IndexedDB `transactions` table
  - Adds to sync queue with `op: 'create'`
  - Returns temporary UUID

**Update:**

- `updateOfflineTransaction(id, changes)` - Update locally
  - Updates IndexedDB record
  - Adds to sync queue with `op: 'update'`, payload = changed fields only

**Delete:**

- `deleteOfflineTransaction(id)` - Soft delete locally
  - Marks as deleted in IndexedDB
  - Adds to sync queue with `op: 'delete'`

**Transfer Handling:**

- Creates two linked transactions (expense + income)
- Both get queued for sync
- Shares `transfer_group_id`

### Account Operations (`accounts.ts`)

**Create/Update/Delete:**

- Same pattern as transactions
- Validates account data before write
- Handles account type constraints

### Category Operations (`categories.ts`)

**Create/Update/Delete:**

- Same pattern as transactions
- Validates parent-child relationships
- Ensures hierarchy integrity

## Testing Strategy

### Unit Tests

**Coverage:**

- Sync queue operations (add, query, update, remove)
- Transaction CRUD operations
- Error handling and rollback
- Idempotency key generation
- Clock increments

**Run Tests:**

```bash
npm test -- offline/syncQueue
npm test -- offline/transactions
npm test -- lib/offline
```

### Test Setup Requirements

**IndexedDB Polyfill:**
Tests need `fake-indexeddb` to mock IndexedDB in Node environment.

**Setup:** See `syncQueue.test.README.md` for complete setup guide.

**Key Points:**

- Import `fake-indexeddb` before Dexie
- Reset database between tests
- Use fake timers for debouncing

### Integration Tests

**Scenarios:**

- Full offline → sync flow
- Rollback on queue failure
- Retry after failure
- Vector clock increments

## Common Development Tasks

### Creating a New Offline Operation

**1. Add entity CRUD module (e.g., `tags.ts`):**

```typescript
export async function createOfflineTag(tag: Tag): Promise<Result<Tag>> {
  // 1. Write to IndexedDB
  await db.tags.put(tag);

  // 2. Add to sync queue
  const result = await addToSyncQueue("create", "tag", tag.id, tag, tag.owner_user_id);

  // 3. Rollback if queue fails
  if (!result.success) {
    await db.tags.delete(tag.id);
    return { success: false, error: result.error };
  }

  return { success: true, data: tag };
}
```

**2. Add to Dexie schema in `dexie/db.ts`**

**3. Update sync processor in `sync/processor.ts` to handle entity type**

**4. Add tests in `offline/tags.test.ts`**

### Debugging Offline Issues

**Check IndexedDB:**

1. Open DevTools → Application → IndexedDB → `householdHubDB`
2. Check table for data (e.g., `transactions`)
3. Verify data is written locally

**Check Sync Queue:**

1. Open DevTools → Application → IndexedDB → `householdHubDB` → `syncQueue` (if using IndexedDB for queue)
2. OR query Supabase `sync_queue` table
3. Look for `status`, `retry_count`, `error_message`

**Console Logs:**

- Offline operations log: `[OfflineTransactions] Created: ...`
- Sync queue logs: `[SyncQueue] Added: ...`
- Rollback logs: `[OfflineTransactions] Rollback: ...`

**Common Issues:**

- **Queue insertion fails:** Check Supabase connection, RLS policies
- **IndexedDB write fails:** Check browser storage quota
- **Rollback not happening:** Verify error handling in operation

### Monitoring Queue Health

**UI Indicators:**

- `OfflineBanner` - Shows offline status and pending count
- `SyncIndicator` - Shows sync status (idle/syncing/error)
- Badge on sync button - Pending count

**Programmatic:**

```typescript
import { getQueueCount } from "@/lib/offline/syncQueue";

const count = await getQueueCount(userId, deviceId);
console.log(`Pending items: ${count}`);
```

## Performance Considerations

**IndexedDB Performance:**

- Compound indexes for common queries (see `dexie/db.ts`)
- Batch operations for imports
- Avoid large payloads in queue (>1MB)

**Queue Growth:**

- Monitor queue size (alert if >1000 items)
- Periodic cleanup of completed items
- Consider compaction for Phase C

**Memory Usage:**

- Queue items cached in memory during sync
- Clear after successful sync session
- Monitor for memory leaks in long sessions

**Sync Efficiency:**

- Debounced sync (1 second after queue change)
- FIFO processing maintains order
- Exponential backoff prevents server overload

## Related Documentation

### Comprehensive Guides

- [/docs/initial plan/SYNC-ENGINE.md](../../../docs/initial%20plan/SYNC-ENGINE.md) - Sync architecture
  - Lines 227-277: Idempotency strategy
  - Lines 365-511: Vector clock theory
  - Lines 1123-1303: Device identification

### Parent and Sibling READMEs

- [../README.md](../README.md) - Core business logic overview
- [../sync/README.md](../sync/README.md) - Sync processor (consumes sync queue)
- [../dexie/README.md](../dexie/README.md) - IndexedDB schema
- [../../hooks/README.md](../../hooks/README.md) - Hooks that use offline operations

### Implementation Chunks

- [Chunk 025](../../../docs/initial%20plan/implementation/chunks/025-offline-mutations/) - Offline operations
- [Chunk 026](../../../docs/initial%20plan/implementation/chunks/026-sync-queue/) - Sync queue setup
- [Chunk 027](../../../docs/initial%20plan/implementation/chunks/027-sync-processor/) - Processor integration

### Project Overview

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
- [../../README.md](../../README.md) - Source code overview

## Further Reading

- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) - Browser storage
- [Dexie.js Documentation](https://dexie.org) - IndexedDB wrapper
- [Offline First Principles](https://offlinefirst.org/) - Design philosophy
- [CRDTs for Offline Systems](https://crdt.tech/) - Conflict-free data types
- [Vector Clock Theory](https://en.wikipedia.org/wiki/Vector_clock) - Causality tracking
