# Milestone 3: Offline Support

**Goal**: App works completely without internet connection
**Time**: 8 hours (28 hours cumulative from start)
**Status**: Offline-first architecture functional

## What You'll Have After This Milestone

✅ Dexie/IndexedDB setup with schema versioning
✅ Offline reads (fallback to cached data when offline)
✅ Offline writes (queue changes for later sync)
✅ Sync queue processor with retry logic
✅ Storage quota monitoring and warnings
✅ Sync UI indicators showing pending changes
✅ Automatic sync when connection restored
✅ Manual sync trigger for user control

**💪 APP WORKS COMPLETELY OFFLINE AT THIS POINT!**

## Chunks in This Milestone

### Storage Setup (Required) - 1 hour

#### 019: Dexie Setup (1 hour)

**What**: IndexedDB wrapper with typed schema
**Outcome**: Local database mirrors Supabase schema

**Key Features**:

- Typed Dexie tables (accounts, categories, transactions)
- Schema versioning with `.upgrade()` functions
- Indexes matching server schema
- Device metadata storage (device ID, last sync)

### Offline Reads (Required) - 2 hours

#### 020: Offline Reads (2 hours)

**What**: Modify queries to read from IndexedDB when offline
**Outcome**: App loads instantly from cache

**Key Features**:

- TanStack Query `queryFn` checks online status
- Fallback to Dexie when `navigator.onLine === false`
- Stale-while-revalidate pattern
- Background sync when reconnected

### Offline Writes (Required) - 5 hours

#### 021: Offline Writes (1.5 hours)

**What**: Queue mutations in IndexedDB when offline
**Outcome**: Can create/edit/delete offline

**Key Features**:

- Optimistic UI updates
- Write to Dexie immediately
- Queue sync operations
- Handle conflicts on reconnect

#### 022: Sync Queue Schema (30 minutes)

**What**: Database table for tracking pending changes
**Outcome**: Server stores queue state

**Schema**:

```sql
CREATE TABLE sync_queue (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id text NOT NULL,
  operation text NOT NULL, -- 'create', 'update', 'delete'
  entity_type text NOT NULL, -- 'transaction', 'account', etc.
  entity_id uuid NOT NULL,
  payload jsonb,
  status text DEFAULT 'queued', -- 'queued', 'syncing', 'failed'
  retry_count int DEFAULT 0,
  last_error text,
  created_at timestamptz DEFAULT now()
);
```

#### 023: Offline Writes Queue (2 hours)

**What**: Implement queue write operations
**Outcome**: Changes persist locally and queue for sync

**Features**:

- Generate unique queue IDs
- Store operation metadata
- Handle optimistic updates
- Rollback on persistent failure

#### 024: Sync Processor (1 hour)

**What**: Process queued changes in order
**Outcome**: Automatic background sync

**Features**:

- Process queue on reconnect
- Exponential backoff on failures
- Max retry limit (3 attempts)
- Error logging

#### 025: Sync UI Indicators (45 minutes)

**What**: Show sync status to user
**Outcome**: Visual feedback for sync state

**Features**:

- Pending count badge
- Syncing spinner
- Error notification
- Manual sync button

## Why This Order?

1. **Dexie first** - Need local database before reads/writes
2. **Reads before writes** - Simpler, no conflict concerns
3. **Queue schema** - Server needs to track sync state
4. **Writes queue** - Generate operations
5. **Processor** - Execute queued operations
6. **UI indicators** - User needs to see sync status

**Parallel opportunity**: After chunk 022, can do 023-024 in parallel if comfortable.

## Success Criteria

### Technical Checklist

- [ ] Dexie schema matches Supabase tables
- [ ] IndexedDB populated on first load
- [ ] Offline detection works (`navigator.onLine`)
- [ ] Queries fallback to Dexie when offline
- [ ] Can create transactions offline
- [ ] Can edit transactions offline
- [ ] Can delete transactions offline
- [ ] Sync queue stores pending operations
- [ ] Sync processor executes on reconnect
- [ ] Failed syncs retry with backoff
- [ ] Max retries prevent infinite loops

### Storage Checklist

- [ ] `navigator.storage.estimate()` monitored
- [ ] Warning shown at 80% quota
- [ ] Cleanup triggered at 95% quota
- [ ] Oldest data pruned first
- [ ] Never delete un-synced changes

### UI Checklist

- [ ] Offline badge visible when disconnected
- [ ] Pending count shows queued operations
- [ ] Syncing spinner during sync
- [ ] Success notification on sync complete
- [ ] Error notification with retry option
- [ ] Manual sync button available

### Sync Flow Checklist

- [ ] **Queued**: Operation created, not sent
- [ ] **Syncing**: Currently being sent to server
- [ ] **Acked**: Server acknowledged, awaiting confirmation
- [ ] **Confirmed**: Server processed successfully
- [ ] **Failed**: Error occurred, will retry

State transitions:

```
queued → syncing → acked → confirmed
       ↓ (on error)
      failed (retry with exponential backoff)
```

### Browser Compatibility

- [ ] Works in Chrome/Edge (IndexedDB + Background Sync)
- [ ] Works in Firefox (IndexedDB, no Background Sync)
- [ ] Works in Safari (IndexedDB, no Background Sync)
- [ ] **iOS Safari**: Manual sync button compensates for no Background Sync API

## Common Issues & Solutions

### Issue: "QuotaExceededError" when writing to IndexedDB

**Symptom**: IndexedDB throws exception, data not saved
**Solution**:

1. Check storage quota: `navigator.storage.estimate()`
2. Implement cleanup: Delete old synced data
3. Reduce payload size: Don't store unnecessary fields
4. Warn user: "Storage almost full, please sync and clear old data"

### Issue: Infinite sync loop

**Symptom**: Sync keeps retrying same operation forever
**Solution**:

1. Verify max retry count enforced (should be 3)
2. Check exponential backoff implemented (1s, 2s, 4s, then fail)
3. Mark failed operations for manual resolution
4. Log error details for debugging

### Issue: Data inconsistency after offline edits

**Symptom**: Local and server data don't match after sync
**Solution**:

1. **Short-term**: Manual resolution - show conflict to user
2. **Long-term**: Implement Milestone 4 (vector clocks)
3. Current strategy: Last-Write-Wins (server timestamp canonical)

### Issue: Background Sync doesn't work on iOS Safari

**Symptom**: Changes don't sync automatically
**Solution**:

- This is expected - iOS Safari doesn't support Background Sync API
- Fallback: Sync on app focus (`window.addEventListener('focus')`)
- Manual button: Always provide "Sync Now" option
- See SYNC-FALLBACKS.md for complete iOS strategy

### Issue: Stale data shown when online

**Symptom**: User sees old cached data despite being online
**Solution**:

1. Check TanStack Query `staleTime` not too long (5min recommended)
2. Verify `networkMode: 'offlineFirst'` not `'always'`
3. Force refetch on reconnect: `queryClient.invalidateQueries()` on `online` event

### Issue: Optimistic update shows wrong data

**Symptom**: UI shows incorrect data before sync completes
**Solution**:

1. Roll back optimistic update on sync failure
2. Show temporary "pending" badge on optimistically updated items
3. Use TanStack Query's `onMutate` / `onError` / `onSettled` correctly

## Time Breakdown

| Chunk      | Activity                   | Time    | Cumulative |
| ---------- | -------------------------- | ------- | ---------- |
| 019        | Dexie schema + versioning  | 1hr     | 1hr        |
| 020        | Offline read fallbacks     | 2hr     | 3hr        |
| 021        | Offline write queue local  | 1.5hr   | 4.5hr      |
| 022        | Sync queue schema (server) | 30min   | 5hr        |
| 023        | Queue write operations     | 2hr     | 7hr        |
| 024        | Sync processor with retry  | 1hr     | 8hr        |
| 025        | Sync UI indicators         | 45min   | 8.75hr     |
| **Buffer** | Testing offline scenarios  | -0.75hr | **8hr**    |

## What Comes Next?

After completing this milestone, choose your path:

### Option 1: Deploy Offline-Capable App

**Next**: Chunk 046-deployment (1.5hr)
**Outcome**: Live app that works offline
**Best for**: Single-device users who need offline support

### Option 2: Add Multi-Device Sync

**Next**: Milestone 4 (chunks 026-035, 10hr)
**Outcome**: Conflict-free multi-device synchronization
**Best for**: Users with multiple devices (phone + laptop)

### Option 3: Add Backups

**Next**: Chunks 036-040 (CSV + R2, 6.5hr)
**Outcome**: Cloud backups + data portability
**Best for**: Data safety paranoia (recommended!)

### Option 4: Production Polish

**Next**: Milestone 5 (chunks 041-046, 7hr)
**Outcome**: PWA + E2E tests + deployment
**Best for**: Professional deployment

## Verification Command

After completing all chunks (019-025), test offline functionality:

```bash
# 1. Start dev server
npm run dev

# 2. Open DevTools → Network tab
# 3. Throttle to "Offline"

# 4. Verify app still loads (from IndexedDB)

# 5. Create a transaction
# 6. Check sync queue has pending operation

# 7. Go back online (Network tab → No throttling)
# 8. Verify auto-sync happens
# 9. Check transaction appears in Supabase
```

### Manual Testing Checklist

#### Offline Read Flow

1. Load app online (data syncs to IndexedDB)
2. Go offline (Network tab or airplane mode)
3. Refresh page
4. **Expected**: App loads, shows cached data
5. **Expected**: "You're offline" banner visible

#### Offline Write Flow

1. While offline, create new transaction
2. **Expected**: Appears in list immediately (optimistic update)
3. **Expected**: Pending count badge shows "1"
4. Edit another transaction
5. **Expected**: Pending count shows "2"
6. **Expected**: Data in IndexedDB, not in Supabase

#### Auto-Sync Flow

1. Go back online
2. **Expected**: Sync starts automatically
3. **Expected**: Spinner shows during sync
4. **Expected**: Success toast on completion
5. **Expected**: Pending count resets to "0"
6. Check Supabase
7. **Expected**: Both transactions present

#### Sync Failure Flow

1. Go offline
2. Create transaction
3. Edit `sync-processor.ts` to force error
4. Go online
5. **Expected**: Sync fails, shows error notification
6. **Expected**: Retry button available
7. Click retry
8. **Expected**: Attempts again

#### Storage Quota Flow

1. Check quota: Open DevTools Console
   ```javascript
   navigator.storage.estimate().then(console.log);
   ```
2. **Expected**: Shows usage and quota
3. If usage > 80%
4. **Expected**: Warning notification appears

## Performance Verification

Test with realistic offline scenarios:

```javascript
// Generate 100 offline transactions
for (let i = 0; i < 100; i++) {
  await createTransactionOffline({
    amount_cents: 100000,
    type: "expense",
    category_id: "groceries",
    date: new Date(),
  });
}

// Then go online and verify:
// - Sync completes in < 30 seconds
// - UI remains responsive during sync
// - All 100 transactions appear in Supabase
```

## Database Verification

Check sync queue state:

```sql
-- Check pending operations
SELECT
  device_id,
  operation,
  entity_type,
  status,
  retry_count,
  created_at
FROM sync_queue
WHERE status IN ('queued', 'syncing')
ORDER BY created_at;

-- Check failed operations
SELECT
  entity_type,
  entity_id,
  last_error,
  retry_count,
  created_at
FROM sync_queue
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- Check sync queue size per device
SELECT
  device_id,
  COUNT(*) as pending_count
FROM sync_queue
WHERE status = 'queued'
GROUP BY device_id;
```

## References

- **Original Plan**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Days 8-10
- **Sync Engine**: `docs/initial plan/SYNC-ENGINE.md`
  - Offline writes: lines 74-164
  - Sync queue: lines 165-254
  - iOS Safari fallback: lines 1400-1523
- **Architecture**: `docs/initial plan/ARCHITECTURE.md`
  - Three-layer state: lines 50-120
  - Offline-first principles: lines 121-195
- **Decisions**: `docs/initial plan/DECISIONS.md`
  - #62: Event sourcing from Phase A (simplified in Milestone 3)
  - #75: Hybrid device ID strategy
  - #77: Field-level conflict resolution (Milestone 4)
- **Sync Fallbacks**: `docs/initial plan/SYNC-FALLBACKS.md`
  - iOS Safari limitations
  - Manual sync patterns
  - Focus-based sync trigger

## Key Architectural Points

### Offline-First Pattern

**Three-layer state** (CRITICAL):

```
UI State (Zustand)
   ↕ optimistic updates
IndexedDB (Dexie) ← Truth when offline
   ↕ background sync
Supabase (PostgreSQL) ← Canonical truth
```

**Read priority**:

1. Check if online
2. If offline → read from IndexedDB
3. If online → fetch from Supabase, update IndexedDB in background

**Write priority**:

1. Write to IndexedDB immediately (optimistic)
2. Queue sync operation
3. Sync to Supabase when online

### Sync Queue States

```
draft → queued → syncing → acked → confirmed
              ↓ (on error)
            failed (with retry + exponential backoff)
```

**State meanings**:

- **draft**: Not yet queued (local only)
- **queued**: Ready to sync, waiting for network
- **syncing**: Currently being sent
- **acked**: Server received, processing
- **confirmed**: Server committed to database
- **failed**: Error occurred, will retry

### Storage Quota Management

**Monitoring**:

```typescript
const { usage, quota } = await navigator.storage.estimate();
const percentUsed = (usage / quota) * 100;

if (percentUsed > 80) {
  showWarning("Storage almost full");
}
if (percentUsed > 95) {
  await cleanupOldData();
}
```

**Cleanup strategy**:

1. Never delete un-synced data (`status = 'queued'`)
2. Delete oldest synced transactions first
3. Keep last 90 days minimum
4. Warn user before auto-cleanup

### iOS Safari Considerations

**Background Sync API** not supported:

- Fallback 1: Sync on app focus
- Fallback 2: Manual "Sync Now" button
- Fallback 3: Periodic check (every 5 minutes if active)

**Implementation**:

```typescript
window.addEventListener("focus", () => {
  if (navigator.onLine && hasPendingChanges()) {
    syncQueue.process();
  }
});
```

See SYNC-FALLBACKS.md for complete strategy.

---

**Ready to start?** → `chunks/019-dexie-setup/README.md`

**Completed Milestone 2?** Verify first:

```
Run chunks 004-014 checkpoints to ensure MVP is working before adding offline support
```

**Why offline support?**

- Works on flaky connections (public WiFi, commute)
- Instant app load (no network wait)
- Foundation for multi-device sync (Milestone 4)
- Better user experience overall
