# Sync Engine (`/src/lib/sync/`)

## Purpose

The sync engine implements **multi-device synchronization** with conflict resolution, enabling offline-first operation across devices. It processes the sync queue to push local changes to Supabase, handles ID mapping (temporary → server UUIDs), implements retry logic with exponential backoff, and tracks conflicts.

## Contents

### Core Modules

- **`processor.ts`** (20.2KB) - Main sync processor
  - Processes sync queue in FIFO order
  - Replaces temporary IDs with server UUIDs
  - Implements retry logic with exponential backoff
  - Classifies errors (retryable vs non-retryable)
  - **See lines 1-44 for excellent inline documentation**

- **`autoSync.ts`** (10KB) - Automatic sync manager
  - Monitors sync queue for changes
  - Triggers sync processor automatically
  - Debounces sync requests (1 second)
  - Integrates with online status detection

- **`idempotency.ts`** (7.4KB) - Idempotency key handling
  - Generates idempotency keys: `${deviceId}-${entityType}-${entityId}-${lamportClock}`
  - Ensures exactly-once processing
  - Handles duplicate detection

- **`idMapping.ts`** (6.6KB) - Temporary ID mapping
  - Maps temporary UUIDs to server-assigned UUIDs
  - Used during sync to replace references
  - Cleared after successful sync session
  - Session-scoped (in-memory only)

- **`lamportClock.ts`** (8.9KB) - Lamport logical clock
  - Increments per-entity lamport clocks
  - Used in idempotency keys
  - Simple monotonic counter per entity

- **`vectorClock.ts`** (11.1KB) - Vector clock implementation
  - Per-entity vector clocks (NOT global)
  - Used for conflict detection (Phase B)
  - Tracks causality across devices
  - Format: `{ "device-1": 5, "device-2": 3 }`

- **`retry.ts`** (3.4KB) - Retry logic utilities
  - Exponential backoff calculation
  - Sleep utility for delays
  - Max retry limits

- **`SyncIssuesManager.ts`** (12.5KB) - Conflict/issue tracking
  - Tracks sync conflicts and errors
  - Stores issues for user resolution
  - Provides conflict resolution UI data

### Test Files

- **`idempotency.test.ts`** (7.7KB) - Idempotency key tests

## Architecture Overview

### Sync Flow

```
┌───────────────────────────────────────────────────┐
│  User Action (Create/Update/Delete Entity)       │
└─────────────────────┬─────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────┐
│  Offline Operation (writes to IndexedDB)         │
│  + Add to Sync Queue (syncQueue.ts)              │
└─────────────────────┬─────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────┐
│  Auto Sync Manager (autoSync.ts)                 │
│  - Monitors queue                                 │
│  - Triggers processor when online                 │
└─────────────────────┬─────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────┐
│  Sync Processor (processor.ts)                   │
│  1. Get pending queue items                       │
│  2. Replace temporary IDs (idMapping)             │
│  3. Execute operation against Supabase            │
│  4. Handle success/failure                        │
│  5. Update queue status                           │
└─────────────────────┬─────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────┐
│  Success: Mark completed, remove from queue      │
│  Failure: Retry (if retryable) or fail           │
└───────────────────────────────────────────────────┘
```

### State Machine

Sync queue items progress through these states:

```
draft     [Initial state, not yet queued]
  ↓
queued    [Ready to sync]
  ↓
syncing   [Currently processing]
  ↓
  ├──→ acked      [Server acknowledged, awaiting confirmation]
  │      ↓
  │    confirmed  [Fully committed, can be removed]
  │
  └──→ failed     [Non-retryable error or max retries exceeded]
       OR
     queued       [Retryable error, back to queue with backoff]
```

## Key Components

### 1. Sync Processor (`processor.ts`)

**Core Responsibility:** Process sync queue to push local changes to Supabase.

**Processing Order:**

- FIFO (First-In-First-Out) based on `created_at` timestamp
- One item at a time to maintain order
- Prevents concurrent processing with `isProcessing` flag

**ID Replacement Flow:**

1. Before sync: Replace temporary IDs in payload using `idMapping.replaceIds()`
2. After create: Store mapping `idMapping.add(tempId, serverId)`
3. After session: Clear mappings `idMapping.clear()`

**Error Classification:**

**Non-Retryable Errors (fail immediately):**

- Validation errors (`23505` unique constraint, `23503` foreign key)
- Syntax errors (`42P01` undefined table, `42601` syntax)
- Permission errors (`42501` insufficient privilege)

**Retryable Errors (retry with backoff):**

- Network errors (`PGRST` codes, fetch failures)
- RLS policy violations (may resolve after sync)
- Timeout errors

**Retry Strategy:**

- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s (max)
- Max 3 retry attempts (configurable)
- Permanent failures don't retry

**See:** `processor.ts:1-44` for complete inline documentation.

### 2. Auto Sync Manager (`autoSync.ts`)

**Core Responsibility:** Automatically trigger sync when conditions are met.

**Trigger Conditions:**

- Network comes back online (online status change)
- Queue receives new items (Dexie live query)
- App gains focus (visibility change)
- Background sync event (iOS Safari fallback)

**Debouncing:**

- Waits 1 second after queue changes before syncing
- Prevents excessive sync attempts during bulk operations

**Integration Points:**

- Registered in `App.tsx:50-65`
- Uses `useSyncProcessor()` hook
- Respects offline mode (waits for online)

### 3. Idempotency System (`idempotency.ts`)

**Core Responsibility:** Ensure exactly-once processing even with network retries.

**Key Format:**

```
${deviceId}-${entityType}-${entityId}-${lamportClock}
```

**Example:**

```
"device-abc123-transaction-txn-456-42"
```

**How It Works:**

1. Client generates idempotency key before sync
2. Server checks if key already processed
3. If duplicate, returns cached response (no-op)
4. If new, processes operation and stores key

**Benefits:**

- Network retries are safe (won't duplicate data)
- Same operation from same device is idempotent
- Different devices can make concurrent changes (vector clocks handle conflicts)

### 4. ID Mapping (`idMapping.ts`)

**Core Responsibility:** Map temporary UUIDs to server-assigned UUIDs.

**Why Needed:**

- Client creates entities with temporary UUIDs (e.g., `temp-123`)
- Server assigns permanent UUIDs (e.g., `uuid-abc-def`)
- Related entities reference temp IDs, need replacement

**Session-Scoped:**

- Mappings stored in memory during sync session
- Cleared after successful sync completion
- Not persisted to IndexedDB

**Workflow:**

1. **Create transaction with temp ID:** Client assigns `temp-txn-001`
2. **Sync to server:** Server returns permanent ID `uuid-real-001`
3. **Store mapping:** `idMapping.add("temp-txn-001", "uuid-real-001")`
4. **Update related entities:** Replace all references to temp ID
5. **Clear after sync:** `idMapping.clear()`

### 5. Vector Clocks (`vectorClock.ts`)

**Core Responsibility:** Track causality for conflict detection (Phase B).

**Structure:**
Per-entity vector clock scoped to specific entity:

```json
{
  "device-123": 5,
  "device-456": 3,
  "device-789": 1
}
```

**Operations:**

- **Increment:** `increment(clock, deviceId)` - Bump device's counter
- **Compare:** `compare(clockA, clockB)` - Detect concurrent vs causal
- **Merge:** `merge(clockA, clockB)` - Take max of each device
- **Dominates:** `dominates(clockA, clockB)` - Check if A causally precedes B

**Conflict Detection:**

- **Concurrent:** Neither clock dominates → CONFLICT
- **Causal:** One clock dominates → No conflict, newer wins

**See:** `/docs/initial plan/SYNC-ENGINE.md` lines 365-511 for complete theory.

### 6. Lamport Clocks (`lamportClock.ts`)

**Core Responsibility:** Simple monotonic counter per entity.

**Purpose:**

- Used in idempotency keys
- Simpler than vector clocks for Phase A
- Upgraded to vector clocks in Phase B

**Usage:**

- Incremented on every local change
- Stored in IndexedDB per entity
- Part of idempotency key to ensure uniqueness

### 7. Retry Logic (`retry.ts`)

**Core Functions:**

- `calculateRetryDelay(attempt)` - Exponential backoff calculation
- `sleep(ms)` - Async delay utility

**Backoff Schedule:**

- Attempt 1: 1 second
- Attempt 2: 2 seconds
- Attempt 3: 4 seconds
- Attempt 4: 8 seconds
- Attempt 5: 16 seconds
- Attempt 6: 32 seconds
- Attempt 7+: 60 seconds (max)

**Formula:** `Math.min(2^(attempt-1), 60)` seconds

### 8. Sync Issues Manager (`SyncIssuesManager.ts`)

**Core Responsibility:** Track and manage sync conflicts and errors.

**Issue Types:**

- **Conflicts:** Detected by vector clock comparison
- **Validation Errors:** Failed constraint checks
- **Permission Errors:** RLS policy violations
- **Network Errors:** Temporary failures

**User Resolution:**

- Issues stored in IndexedDB (`sync_issues` table)
- UI displays conflicts with resolution options
- User can choose: keep local, keep remote, merge, or skip

**Integration:**

- Used by sync processor to log issues
- Queried by `useSyncIssues()` hook for UI
- Cleared after user resolution

## Testing Strategy

### Unit Tests

**Test Coverage:**

- Idempotency key generation and validation
- Vector clock operations (increment, compare, merge, dominates)
- Retry delay calculation
- Error classification logic

**Run Tests:**

```bash
npm test -- sync/idempotency
npm test -- lib/vector-clock
npm test -- sync/retry
```

### Integration Tests

**Scenarios:**

- Full sync flow (queue → process → confirm)
- ID mapping replacement during sync
- Retry logic with failures
- Concurrent device scenarios

**Location:** `/tests/integration/sync-integration.test.ts`

### E2E Tests

**Scenarios:**

- Offline transaction creation + sync when online
- Multi-device conflict creation + resolution
- Network interruption during sync

**Location:** `/tests/e2e/sync.spec.ts`, `/tests/e2e/offline.spec.ts`

## Common Development Tasks

### Triggering Manual Sync

**UI Component:**

```typescript
import { useSyncProcessor } from "@/hooks/useSyncProcessor";

const { mutate, isLoading } = useSyncProcessor();
// Call mutate() on button click
```

**Programmatic:**

```typescript
import { syncProcessor } from "@/lib/sync/processor";

await syncProcessor.processQueue(userId);
```

### Checking Sync Status

**Hook:**

```typescript
import { useSyncStatus } from "@/hooks/useSyncStatus";

const { status, pendingCount, lastSyncTime } = useSyncStatus();
// status: 'idle' | 'syncing' | 'error'
```

**Store:**

```typescript
import { useSyncStore } from "@/stores/syncStore";

const isSyncing = useSyncStore((state) => state.isSyncing);
```

### Adding New Entity to Sync

1. **Add entity type** to `EntityType` in `/src/types/sync.ts`
2. **Implement CRUD operations** in sync processor `processor.ts`
3. **Add offline operations** in `/src/lib/offline/[entity].ts`
4. **Add Supabase queries** in `/src/lib/supabaseQueries.ts`
5. **Update event generator** in `/src/lib/event-generator.ts`
6. **Test sync flow** with unit and E2E tests

### Debugging Sync Issues

**Console Logs:**

- Processor logs all state transitions: `[SyncProcessor] Processing item: ...`
- Auto sync logs triggers: `[AutoSync] Queue changed, debouncing...`

**IndexedDB Inspection:**

1. Open DevTools → Application → IndexedDB → `householdHubDB`
2. Check `syncQueue` table for pending items
3. Look for `status`, `retry_count`, `error_message` fields

**Sentry:**

- All sync errors logged to Sentry with context
- Search for `SyncProcessor` or `AutoSync` in Sentry

**UI Indicators:**

- `SyncIndicator` (top-right) shows current status
- `OfflineBanner` shows offline state and pending count
- `SyncIssuesPanel` shows unresolved conflicts

## Performance Considerations

**Batch Operations:**

- Processor handles one item at a time (maintains order)
- Consider batching in Phase C for large queues

**Debouncing:**

- Auto sync waits 1 second after queue changes
- Prevents excessive sync attempts during imports

**ID Mapping Memory:**

- Session-scoped, cleared after sync
- Memory usage scales with queue size
- Monitor for large imports (1000+ items)

**Vector Clock Size:**

- Grows with number of active devices
- Compaction possible if device inactive >90 days
- Phase C optimization

## Related Documentation

### Comprehensive Guides

- [/docs/initial plan/SYNC-ENGINE.md](../../../docs/initial%20plan/SYNC-ENGINE.md) - Complete sync architecture (79KB!)
  - Lines 176-224: Retry strategy
  - Lines 365-511: Vector clock theory
  - Lines 620-750: Conflict resolution

### Parent and Sibling READMEs

- [../README.md](../README.md) - Core business logic overview
- [../offline/README.md](../offline/README.md) - Offline operations (sync queue)
- [../dexie/README.md](../dexie/README.md) - Database layer
- [../../hooks/README.md](../../hooks/README.md) - Hooks that use sync (useSyncProcessor, useSyncStatus)

### Implementation Chunks

- [Chunk 027](../../../docs/initial%20plan/implementation/chunks/027-sync-processor/) - Sync processor implementation
- [Chunk 034](../../../docs/initial%20plan/implementation/chunks/034-conflict-resolution/) - Conflict resolution (Phase B)

### Project Overview

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
- [../../README.md](../../README.md) - Source code overview

## Further Reading

- [Vector Clocks Explained](https://en.wikipedia.org/wiki/Vector_clock) - Distributed systems theory
- [Logical Clocks (Lamport)](https://en.wikipedia.org/wiki/Lamport_timestamp) - Ordering events
- [Idempotency in Distributed Systems](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) - AWS best practices
- [Event Sourcing Pattern](https://martinfowler.com/eaaDev/EventSourcing.html) - Martin Fowler
- [CRDTs vs Operational Transform](https://crdt.tech/) - Conflict-free data types
