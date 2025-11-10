# Chunk D11: Sync Queue Integration

## At a Glance

- **Time**: 1 hour
- **Prerequisites**: D10 (Event Sourcing) complete, existing sync queue system
- **Can Skip**: Yes if offline-only mode (but defeats purpose)
- **Depends On**: Sync queue processor, retry logic, exponential backoff

## What You're Building

Integration of debt events into the sync queue for server synchronization:

- **Queue insertion**: Add debt events to sync queue after local creation
- **Sync states**: draft → queued → syncing → acked → confirmed
- **Retry logic**: Exponential backoff for failed sync attempts
- **Error handling**: Network errors, validation errors, conflict errors
- **Batch syncing**: Group related events for efficient transmission
- **Conflict resolution**: Server-side validation and merge
- **Status tracking**: Visual indicators for sync status

## Why This Matters

Sync queue integration enables **multi-device synchronization**:

- **Offline resilience**: Operations work offline, sync when online
- **Multi-device**: Changes from one device appear on others
- **Conflict resolution**: Server determines canonical state
- **Reliability**: Retry logic ensures eventual delivery
- **User awareness**: Users see sync status (pending, synced, error)
- **Data durability**: Events persisted until confirmed by server

This chunk completes the offline-first architecture for debts.

## Before You Start

Verify these prerequisites:

- [ ] **Sync queue system exists** - Check for `sync_queue` table in Dexie
- [ ] **Sync processor exists** - Background job that processes queue
- [ ] **Event sourcing complete** (D10) - Events generated for operations
- [ ] **Server endpoint exists** - API endpoint to receive events
- [ ] **Network detection** - Online/offline detection utilities

**How to verify**:

```bash
# Check for sync queue
grep "sync_queue\|syncQueue" src/lib/dexie.ts

# Check for sync processor
find src -name "*sync*" -o -name "*queue*"

# Check for network detection
grep -r "navigator.onLine\|online\|offline" src/lib/
```

## What Happens Next

After this chunk:

- Debt events automatically queued for sync
- Background processor syncs events to server
- Multi-device synchronization works
- Ready for Chunk D12 (Testing & Edge Cases)

## Key Files Created/Modified

```
src/
├── lib/
│   ├── debts/
│   │   ├── events.ts               # MODIFIED: Add queue insertion
│   │   └── sync.ts                 # NEW: Sync queue helpers
│   └── sync/
│       └── processor.ts            # MODIFIED: Handle debt events
└── types/
    └── sync.ts                     # MODIFIED: Add debt event types
```

## Features Included

### Sync Queue Item Structure

**Queue item format**:

```typescript
{
  id: string;                    // Queue item ID
  entityType: 'debt' | 'internal_debt' | 'debt_payment';
  entityId: string;              // Entity ID
  eventId: string;               // Event ID (from D10)
  operation: 'create' | 'update' | 'delete';
  payload: any;                  // Event payload
  idempotencyKey: string;        // From event

  // Sync state
  state: 'draft' | 'queued' | 'syncing' | 'acked' | 'confirmed' | 'failed';
  attempts: number;              // Retry count
  lastAttemptAt?: string;        // Last sync attempt timestamp
  nextRetryAt?: string;          // Next retry timestamp (exponential backoff)
  error?: string;                // Error message if failed

  // Tracking
  deviceId: string;
  userId: string;
  created_at: string;
  updated_at: string;
}
```

### Sync State Machine

**State transitions**:

```
draft → queued → syncing → acked → confirmed
              ↓ (on error)
            failed → queued (retry)
```

**States**:

- `draft`: Item created locally, not yet ready to sync
- `queued`: Ready to sync, waiting for processor
- `syncing`: Currently being sent to server
- `acked`: Server received, but not yet confirmed persisted
- `confirmed`: Server confirmed successfully persisted
- `failed`: Sync failed, will retry with exponential backoff

### Retry Logic

**Exponential backoff**:

```typescript
const retryDelays = [
  1000, // 1 second
  2000, // 2 seconds
  5000, // 5 seconds
  10000, // 10 seconds
  30000, // 30 seconds
  60000, // 1 minute
  300000, // 5 minutes
];

const nextRetry = retryDelays[Math.min(attempts, retryDelays.length - 1)];
```

**Max retries**: 10 attempts, then mark as permanently failed (requires manual intervention).

### Batch Syncing

**Group related events**:

- Events from same entity batched together
- Events from same transaction batched together
- Maximum batch size: 100 events
- Timeout: 5 seconds (don't wait forever)

**Why batching**: Reduces HTTP overhead, improves throughput.

## Related Documentation

- **Sync Queue**: SYNC-ENGINE.md lines 700-850 (queue processing)
- **Retry Logic**: SYNC-ENGINE.md lines 850-950 (exponential backoff)
- **Conflict Resolution**: SYNC-ENGINE.md lines 365-511 (server-side merge)
- **Event Structure**: D10 chunk (event format)
- **Decisions**:
  - #62: Event sourcing from Phase A
  - #77: Deterministic conflict resolution

## Technical Stack

- **Dexie.js**: Sync queue storage
- **Background job**: Periodic sync processor (setInterval or service worker)
- **Fetch API**: HTTP requests to server
- **Exponential backoff**: Retry with increasing delays
- **TypeScript**: Type-safe queue operations

## Design Patterns

### Queue Insertion Pattern

```typescript
// After creating event, add to sync queue
async function createDebtEvent(...) {
  // 1. Create event
  const event = await createEventInDb(...);

  // 2. Add to sync queue
  await addToSyncQueue({
    entityType: event.entityType,
    entityId: event.entityId,
    eventId: event.id,
    operation: event.op,
    payload: event.payload,
    idempotencyKey: event.idempotencyKey,
  });

  return event;
}
```

**Why**: Single responsibility - event creation separate from queue insertion.

### Background Processor Pattern

```typescript
// Run periodically (every 5 seconds)
setInterval(async () => {
  if (!navigator.onLine) return; // Skip if offline

  // Get items ready to sync
  const items = await db.syncQueue
    .where("state")
    .equals("queued")
    .or("state")
    .equals("failed")
    .and((item) => !item.nextRetryAt || new Date(item.nextRetryAt) <= new Date())
    .limit(100)
    .toArray();

  // Sync each item
  for (const item of items) {
    await syncItem(item);
  }
}, 5000);
```

**Why**: Periodic processing ensures eventual delivery, resilient to network issues.

### Idempotent Sync Pattern

```typescript
// Server checks idempotency key
async function handleEventSync(event) {
  // Check if already processed
  const existing = await db.events.where("idempotencyKey").equals(event.idempotencyKey).first();

  if (existing) {
    return { status: "duplicate", eventId: existing.id };
  }

  // Process event
  const result = await processEvent(event);
  return { status: "success", eventId: result.id };
}
```

**Why**: Idempotency prevents duplicate operations if sync retried.

### Exponential Backoff Pattern

```typescript
function calculateNextRetry(attempts: number): Date {
  const delays = [1000, 2000, 5000, 10000, 30000, 60000, 300000];
  const delay = delays[Math.min(attempts, delays.length - 1)];
  return new Date(Date.now() + delay);
}

async function markSyncFailed(itemId: string, error: string) {
  const item = await db.syncQueue.get(itemId);

  await db.syncQueue.update(itemId, {
    state: "failed",
    attempts: item.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
    nextRetryAt: calculateNextRetry(item.attempts + 1).toISOString(),
    error,
  });
}
```

**Why**: Exponential backoff reduces server load during outages, increases success probability.

## Critical Concepts

**Queue ≠ Events**: The sync queue is **separate** from the events table:

- **Events table**: Immutable log of all operations (permanent)
- **Sync queue**: Transient queue of events to sync (temporary, deleted after confirm)

Events persist forever, queue items deleted after successful sync.

**State Machine Enforcement**: State transitions must follow the state machine:

- Can't go from `draft` → `acked` (must go through `queued` → `syncing`)
- Can't go from `confirmed` → `failed` (confirmed is terminal)
- `failed` can transition back to `queued` (for retry)

**Idempotency Key Purpose**: Server uses idempotency key to:

1. Detect duplicate sync requests
2. Return cached result for duplicates
3. Prevent duplicate event processing

**Network Detection**: Sync processor checks `navigator.onLine` before syncing:

- If offline, skip sync iteration
- If online, proceed with sync
- Listen for `online` event to trigger immediate sync

**Error Types**:

- **Network error**: Retry with exponential backoff
- **Validation error**: Don't retry (requires user fix)
- **Conflict error**: Server determines resolution, don't retry
- **Server error (5xx)**: Retry with exponential backoff
- **Client error (4xx)**: Don't retry (except 429 rate limit)

## Sync Queue Item Examples

### Queued Item (Ready to Sync)

```typescript
{
  id: 'sq-abc123',
  entityType: 'debt',
  entityId: 'debt-1',
  eventId: 'evt-def456',
  operation: 'create',
  payload: {
    household_id: 'h1',
    name: 'Car Loan',
    original_amount_cents: 100000,
    status: 'active',
  },
  idempotencyKey: 'device-abc-debt-debt-1-42',
  state: 'queued',
  attempts: 0,
  deviceId: 'device-abc',
  userId: 'user-1',
  created_at: '2025-11-10T10:00:00Z',
  updated_at: '2025-11-10T10:00:00Z',
}
```

### Failed Item (Will Retry)

```typescript
{
  id: 'sq-ghi789',
  entityType: 'debt_payment',
  entityId: 'pay-1',
  eventId: 'evt-jkl012',
  operation: 'create',
  payload: { /* ... */ },
  idempotencyKey: 'device-abc-debt_payment-pay-1-44',
  state: 'failed',
  attempts: 3,
  lastAttemptAt: '2025-11-10T10:05:00Z',
  nextRetryAt: '2025-11-10T10:15:00Z', // 10 seconds from last attempt
  error: 'Network error: fetch failed',
  deviceId: 'device-abc',
  userId: 'user-1',
  created_at: '2025-11-10T10:00:00Z',
  updated_at: '2025-11-10T10:05:00Z',
}
```

### Confirmed Item (Successfully Synced)

```typescript
{
  id: 'sq-mno345',
  entityType: 'debt',
  entityId: 'debt-1',
  eventId: 'evt-pqr678',
  operation: 'update',
  payload: { name: 'New Name', updated_at: '2025-11-10T11:00:00Z' },
  idempotencyKey: 'device-abc-debt-debt-1-43',
  state: 'confirmed',
  attempts: 1,
  lastAttemptAt: '2025-11-10T10:01:00Z',
  deviceId: 'device-abc',
  userId: 'user-1',
  created_at: '2025-11-10T10:00:00Z',
  updated_at: '2025-11-10T10:01:00Z',
}
```

## Integration Points

### Event Creation (D10)

**After creating event, add to queue**:

```typescript
// In createDebtEvent, after db.events.add(event):
await addToSyncQueue({
  entityType: event.entityType,
  entityId: event.entityId,
  eventId: event.id,
  operation: event.op,
  payload: event.payload,
  idempotencyKey: event.idempotencyKey,
});
```

### Sync Processor

**Process queue items**:

```typescript
// Background job (every 5 seconds)
async function processSyncQueue() {
  const items = await getQueuedItems();

  for (const item of items) {
    await syncItemToServer(item);
  }
}
```

### UI Status Indicators

**Show sync status to user**:

```typescript
// In UI components
const { data: syncStatus } = useQuery({
  queryKey: ['sync-status', debtId],
  queryFn: () => getSyncStatus(debtId),
});

// Show badge
{syncStatus === 'syncing' && <Badge>Syncing...</Badge>}
{syncStatus === 'failed' && <Badge variant="destructive">Sync Failed</Badge>}
```

## Error Handling Strategies

**Network errors** (fetch failed, timeout):

- Retry with exponential backoff
- Max 10 attempts
- Show "Offline" indicator to user

**Validation errors** (4xx client errors):

- Don't retry
- Mark as permanently failed
- Show error message to user
- Require manual fix (e.g., edit debt and re-save)

**Conflict errors** (409 Conflict):

- Server determines resolution
- Don't retry
- Mark as confirmed (server handled it)
- Fetch latest state from server

**Server errors** (5xx server errors):

- Retry with exponential backoff
- Same as network errors

**Rate limit** (429 Too Many Requests):

- Retry with longer delay
- Respect `Retry-After` header

## Performance Considerations

**Batch Size**: 100 events per sync iteration

- Too small: Excessive HTTP overhead
- Too large: Long-running requests, potential timeout

**Sync Frequency**: Every 5 seconds

- Too frequent: Battery drain, server load
- Too infrequent: Slow sync, poor UX

**Queue Cleanup**: Delete confirmed items after 24 hours

- Keeps queue small
- Allows debugging recent syncs
- Old items cleaned up automatically

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
