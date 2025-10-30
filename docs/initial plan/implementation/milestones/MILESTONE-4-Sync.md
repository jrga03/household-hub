# Milestone 4: Multi-Device Sync Engine

**Goal**: Conflict-free synchronization across multiple devices
**Time**: 10 hours (38 hours cumulative from start)
**Status**: Production-grade sync engine functional

## What You'll Have After This Milestone

✅ Device identification with hybrid strategy (IndexedDB → localStorage → FingerprintJS)
✅ Devices table tracking all user devices
✅ Event sourcing with immutable audit log
✅ Idempotency keys preventing duplicate events
✅ Per-entity vector clocks for conflict detection
✅ Automatic field-level conflict resolution (LWW)
✅ Realtime synchronization via Supabase subscriptions
✅ Event compaction preventing unbounded growth
✅ Encrypted R2 backups (optional but recommended)
✅ CSV import/export for data portability

**🔄 TWO DEVICES STAY IN PERFECT SYNC!**

## Chunks in This Milestone

### Device Management (Required) - 1.5 hours

#### 026: Device Hybrid ID (1 hour)

**What**: Reliable device identification across browser storage wipes
**Outcome**: Each device has stable, unique ID

**Hybrid Strategy** (Decision #75):

1. **Primary**: IndexedDB stored device ID
2. **Backup**: localStorage copy
3. **Fallback**: FingerprintJS generated ID
4. **Registration**: Store in `devices` table on first use

#### 027: Devices Table (30 minutes)

**What**: Server-side device registry
**Outcome**: Track all devices per user

**Schema**:

```sql
CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users NOT NULL,
  device_id text UNIQUE NOT NULL, -- From hybrid strategy
  device_name text, -- "iPhone 13", "MacBook Pro"
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
```

### Event Sourcing (Required) - 3.5 hours

#### 028: Events Schema (45 minutes)

**What**: Immutable audit log for all changes
**Outcome**: Complete transaction history

**Schema**:

```sql
CREATE TABLE transaction_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key text UNIQUE NOT NULL,

  -- What changed
  entity_type text NOT NULL, -- 'transaction', 'account', etc.
  entity_id uuid NOT NULL,
  operation text NOT NULL, -- 'create', 'update', 'delete'
  payload jsonb NOT NULL, -- Changed fields only

  -- Conflict resolution
  lamport_clock bigint NOT NULL, -- Per-entity counter
  vector_clock jsonb NOT NULL, -- Per-entity {deviceId: clock}

  -- Audit
  actor_user_id uuid REFERENCES auth.users NOT NULL,
  device_id text NOT NULL,
  timestamp timestamptz DEFAULT now()
);
```

#### 029: Idempotency Keys (1 hour)

**What**: Prevent duplicate events in distributed system
**Outcome**: Same operation never creates two events

**Format**: `${deviceId}-${entityType}-${entityId}-${lamportClock}`
**Example**: `fp-abc123-transaction-uuid-42`

#### 030: Event Generation (1.5 hours)

**What**: Create events for all mutations
**Outcome**: Every change generates immutable event

**Triggers**:

- Transaction created → `create` event
- Transaction updated → `update` event (changed fields only)
- Transaction deleted → `delete` event

### Conflict Resolution (Required) - 4 hours

#### 031: Vector Clocks (2 hours)

**What**: Per-entity version tracking
**Outcome**: Detect concurrent edits

**Structure** (per entity):

```json
{
  "fp-device1": 5, // Device 1 has seen 5 changes
  "fp-device2": 3 // Device 2 has seen 3 changes
}
```

**Rules**:

- Increment own clock on each change
- Merge clocks on sync
- Detect conflicts when clocks diverge

#### 032: Conflict Detection (1 hour)

**What**: Identify when two devices edited same entity
**Outcome**: Flag conflicts for resolution

**Algorithm**:

```typescript
function detectConflict(local: VectorClock, remote: VectorClock): boolean {
  // If either is strictly greater, no conflict
  if (isGreaterThan(local, remote) || isGreaterThan(remote, local)) {
    return false;
  }
  // Otherwise, clocks diverged = conflict
  return true;
}
```

#### 033: Conflict Resolution (1.5 hours)

**What**: Automatically resolve conflicts using field-level LWW
**Outcome**: User never sees conflict UI

**Strategy** (Decision #77):

- **Field-level**: Compare each field separately
- **LWW**: Server canonical timestamp wins
- **DELETE wins**: If one side deleted, deletion prevails
- **Deterministic**: Same inputs → same result

### Sync Optimization (Required) - 1 hour

#### 034: Realtime Sync (1 hour)

**What**: Supabase realtime subscriptions for instant updates
**Outcome**: Changes propagate in <1 second

**Setup**:

```typescript
supabase
  .channel("transaction_events")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "transaction_events" },
    handleRemoteEvent
  )
  .subscribe();
```

#### 035: Event Compaction (1 hour)

**What**: Prevent unbounded event growth
**Outcome**: Old events pruned, snapshots kept

**Strategy**:

- Compact after 100 events per entity OR monthly
- Create snapshot with latest state
- Delete individual events
- Keep snapshots forever (for audit)
- Retention: 90 days for raw events

### Backups (Optional but Recommended) - 6.5 hours

#### 036: CSV Export (1 hour)

**What**: Export transactions to CSV
**Outcome**: Data portability

#### 037: CSV Import (2 hours)

**What**: Import transactions from CSV with deduplication
**Outcome**: Can migrate from other apps

#### 038: R2 Setup (1 hour)

**What**: Cloudflare R2 bucket for encrypted backups
**Outcome**: Cloud storage configured

#### 039: Backup Encryption (2 hours)

**What**: Client-side AES-GCM encryption
**Outcome**: Backups encrypted before upload

#### 040: Backup Worker (1.5 hours)

**What**: Cloudflare Worker for upload proxy
**Outcome**: Secure signed URL generation

## Why This Order?

1. **Device ID first** - Everything needs to know which device
2. **Devices table** - Server tracking of devices
3. **Events schema** - Foundation for event sourcing
4. **Idempotency** - Prevent duplicates
5. **Event generation** - Start creating events
6. **Vector clocks** - Conflict detection
7. **Conflict detection** - Identify problems
8. **Conflict resolution** - Solve problems
9. **Realtime** - Instant propagation
10. **Compaction** - Prevent bloat

**Parallel tracks**: Chunks 036-040 (backups) can be done anytime after 026 (device ID).

## Success Criteria

### Technical Checklist

- [ ] Device ID persists across page reloads
- [ ] Device ID recovers from localStorage if IndexedDB cleared
- [ ] FingerprintJS generates ID if both storages cleared
- [ ] Devices table shows all user devices
- [ ] Events created for create/update/delete operations
- [ ] Idempotency key prevents duplicate events
- [ ] Lamport clock increments on each change
- [ ] Vector clock merges correctly
- [ ] Conflicts detected when clocks diverge
- [ ] Field-level LWW resolution automatic
- [ ] DELETE wins over UPDATE
- [ ] Realtime subscriptions propagate changes <1s
- [ ] Event compaction triggers at 100 events
- [ ] Backups encrypt with AES-GCM
- [ ] R2 Worker validates JWT before upload

### Multi-Device Flow Checklist

**Scenario**: Two devices edit same transaction

1. **Device A**: Offline, edits transaction amount
   - [ ] Local vector clock updated
   - [ ] Event created with Device A's clock
   - [ ] Queued for sync

2. **Device B**: Offline, edits same transaction description
   - [ ] Local vector clock updated
   - [ ] Event created with Device B's clock
   - [ ] Queued for sync

3. **Both go online**:
   - [ ] Device A syncs first
   - [ ] Device B syncs second
   - [ ] Conflict detected (vector clocks diverged)
   - [ ] Resolution: Merge both changes
     - Amount from Device A (newer timestamp)
     - Description from Device B (newer timestamp)
   - [ ] Both devices converge to same state

4. **Verification**:
   - [ ] Final state has BOTH changes
   - [ ] No data lost
   - [ ] User never saw conflict UI

### Event Sourcing Checklist

- [ ] Can replay all changes from events
- [ ] Events are immutable (no UPDATE/DELETE on events)
- [ ] Payload includes only changed fields
- [ ] Can reconstruct entity state at any point in time
- [ ] Idempotency prevents duplicate event replay

### Backup Checklist (If Implemented)

- [ ] CSV export includes all transactions
- [ ] CSV import deduplicates existing transactions
- [ ] R2 upload uses signed URLs (not direct access)
- [ ] Backups encrypted with user-derived key
- [ ] Can decrypt and restore from backup

## Common Issues & Solutions

### Issue: Duplicate events created

**Symptom**: Same change creates multiple events
**Solution**:

1. Check idempotency key is truly unique per operation
2. Verify database constraint on `idempotency_key`
3. Use format: `${deviceId}-${entityType}-${entityId}-${lamportClock}`
4. Lamport clock must increment atomically

### Issue: Conflict resolution loses data

**Symptom**: After sync, some changes disappear
**Solution**:

1. Verify using field-level merge, not entity-level
2. Check server canonical timestamp used (not local)
3. Ensure DELETE wins logic is correct
4. Test with manual conflict scenario:
   ```typescript
   // Device A: Update amount
   // Device B: Update description
   // Expected: Both changes merge
   ```

### Issue: Vector clocks grow unbounded

**Symptom**: `vector_clock` JSONB becomes huge
**Solution**:

1. Clock is per-entity, not global
2. Only active devices appear in clock
3. Prune devices not seen in 90 days
4. Compact events after resolution

### Issue: Realtime subscriptions not firing

**Symptom**: Changes don't propagate to other devices
**Solution**:

1. Check Supabase project has realtime enabled
2. Verify RLS policies allow reads for events
3. Check subscription error handler for auth issues
4. Test with manual insert to `transaction_events`

### Issue: Device ID keeps changing

**Symptom**: New device created on every page load
**Solution**:

1. Check IndexedDB write succeeded
2. Verify localStorage fallback works
3. Test in private/incognito mode (storage cleared)
4. FingerprintJS should be last resort only

### Issue: Event compaction deletes un-synced events

**Symptom**: Data loss after compaction
**Solution**:

1. Never compact events with `status = 'queued'`
2. Only compact events confirmed synced to all devices
3. Check 90-day retention period enforced
4. Keep snapshots forever

## Time Breakdown

| Chunk      | Activity             | Time    | Cumulative |
| ---------- | -------------------- | ------- | ---------- |
| 026        | Device hybrid ID     | 1hr     | 1hr        |
| 027        | Devices table        | 30min   | 1.5hr      |
| 028        | Events schema        | 45min   | 2.25hr     |
| 029        | Idempotency keys     | 1hr     | 3.25hr     |
| 030        | Event generation     | 1.5hr   | 4.75hr     |
| 031        | Vector clocks        | 2hr     | 6.75hr     |
| 032        | Conflict detection   | 1hr     | 7.75hr     |
| 033        | Conflict resolution  | 1.5hr   | 9.25hr     |
| 034        | Realtime sync        | 1hr     | 10.25hr    |
| 035        | Event compaction     | 1hr     | 11.25hr    |
| **Buffer** | Multi-device testing | -1.25hr | **10hr**   |

### Optional Backups

| Chunk | Activity          | Time  | Notes        |
| ----- | ----------------- | ----- | ------------ |
| 036   | CSV export        | 1hr   | Recommended  |
| 037   | CSV import        | 2hr   | Recommended  |
| 038   | R2 setup          | 1hr   | Optional     |
| 039   | Backup encryption | 2hr   | Requires 038 |
| 040   | Backup worker     | 1.5hr | Requires 039 |

**Total with backups**: 17.5 hours

## What Comes Next?

After completing this milestone:

### Option 1: Production Deploy

**Next**: Milestone 5 (chunks 041-046, 7hr)
**Outcome**: PWA + E2E tests + live deployment
**Best for**: Launching to users

### Option 2: Add Backups (If Skipped)

**Next**: Chunks 036-040 (6.5hr)
**Outcome**: Encrypted cloud backups
**Best for**: Data safety

### Option 3: User Testing

**Next**: Test with real users on multiple devices
**Outcome**: Validate sync works in production
**Best for**: Confidence before launch

## Verification Command

Multi-device sync requires TWO browsers/devices for testing:

### Setup

```bash
# Terminal 1: Device A
npm run dev

# Terminal 2: Device B (different browser or incognito)
npm run dev -- --port 3001
```

### Test Scenario 1: Concurrent Creates

1. **Device A**: Create transaction "Groceries ₱500"
2. **Device B**: Create transaction "Coffee ₱150"
3. **Expected**: Both devices see both transactions within 1 second

### Test Scenario 2: Concurrent Edits (No Conflict)

1. **Both devices**: Load same transaction
2. **Device A**: Edit amount to ₱600
3. **Device B**: Edit description to "Groceries + Coffee"
4. **Expected**: Both changes merge, both devices converge

### Test Scenario 3: Concurrent Edits (Same Field)

1. **Both devices**: Offline, load same transaction
2. **Device A**: Edit amount to ₱700 at 10:00:00
3. **Device B**: Edit amount to ₱800 at 10:00:05 (5 seconds later)
4. **Both go online**
5. **Expected**: Amount is ₱800 (later timestamp wins)
6. **Expected**: No data loss, both devices converge

### Test Scenario 4: DELETE vs UPDATE

1. **Device A**: Offline, delete transaction
2. **Device B**: Offline, edit same transaction
3. **Both go online**
4. **Expected**: Transaction is deleted (DELETE wins)
5. **Expected**: Both devices converge to deleted state

### Test Scenario 5: Event Compaction

1. Create 101 events for same transaction (edit 101 times)
2. **Expected**: Compaction triggers automatically
3. **Expected**: Snapshot created with latest state
4. **Expected**: Old events deleted
5. Check database: Should have 1 snapshot, not 101 events

## Performance Verification

Test sync performance:

```javascript
// Generate 50 transactions on Device A
const startTime = performance.now();

for (let i = 0; i < 50; i++) {
  await createTransaction({ amount_cents: 10000, type: "expense" });
}

// Switch to Device B, wait for sync
// Then verify:
const syncTime = performance.now() - startTime;

// Expected: < 5 seconds for 50 transactions
console.assert(syncTime < 5000, "Sync too slow");
```

## Database Verification

Check event sourcing state:

```sql
-- Count events per entity type
SELECT
  entity_type,
  operation,
  COUNT(*) as event_count
FROM transaction_events
GROUP BY entity_type, operation;

-- Check for duplicate idempotency keys (should be 0)
SELECT
  idempotency_key,
  COUNT(*) as count
FROM transaction_events
GROUP BY idempotency_key
HAVING COUNT(*) > 1;

-- Verify vector clocks are incrementing
SELECT
  entity_id,
  entity_type,
  vector_clock,
  lamport_clock
FROM transaction_events
ORDER BY entity_id, lamport_clock;

-- Check devices registered
SELECT
  device_id,
  device_name,
  last_seen_at,
  created_at
FROM devices
WHERE user_id = 'your-user-id';

-- Event compaction stats
SELECT
  entity_id,
  COUNT(*) as event_count,
  MAX(lamport_clock) as latest_clock
FROM transaction_events
WHERE entity_type = 'transaction'
GROUP BY entity_id
HAVING COUNT(*) > 100; -- Should trigger compaction
```

## References

- **Original Plan**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Days 8-12
- **Sync Engine**: `docs/initial plan/SYNC-ENGINE.md`
  - Event sourcing: lines 1-73
  - Vector clocks: lines 365-511
  - Conflict resolution: lines 512-704
  - Idempotency: lines 255-312
  - Event compaction: lines 1346-1399
- **Decisions**: `docs/initial plan/DECISIONS.md`
  - #62: Event sourcing from Phase A
  - #75: Hybrid device ID strategy
  - #77: Field-level LWW conflict resolution
  - #82: Devices table in MVP (not Phase B)
- **Architecture**: `docs/initial plan/ARCHITECTURE.md`
  - Three-layer state
  - Event-driven sync
- **R2 Backups**: `docs/initial plan/R2-BACKUP.md`
  - Encryption strategy
  - Worker implementation

## Key Architectural Points

### Per-Entity Vector Clocks (Decision #77)

**Why per-entity**:

- Global clock would show false conflicts
- Entity clock only tracks changes to that specific record
- Smaller clock size in JSONB

**Example**:

```typescript
// Transaction A edited by Device 1 and Device 2
{
  "fp-device1": 3,  // Device 1 made 3 changes to this transaction
  "fp-device2": 2   // Device 2 made 2 changes to this transaction
}

// Transaction B edited only by Device 1
{
  "fp-device1": 1   // Device 1 made 1 change to this transaction
}
```

### Field-Level Last-Write-Wins

**Not entity-level** (avoids data loss):

```typescript
// Device A: Update amount at 10:00:00
{ amount_cents: 50000 }

// Device B: Update description at 10:00:05
{ description: "Updated description" }

// WRONG (entity-level LWW):
// Device B's update wins, amount change lost!
{ amount_cents: 40000, description: "Updated description" } // ❌

// CORRECT (field-level LWW):
// Merge both changes
{ amount_cents: 50000, description: "Updated description" } // ✅
```

### Idempotency Key Format

**Guarantees uniqueness**:

```
${deviceId}-${entityType}-${entityId}-${lamportClock}

Example:
fp-abc123-transaction-uuid-42
```

**Why this works**:

- Device ID: Unique per device
- Entity type: Prevents cross-type collisions
- Entity ID: Specific record
- Lamport clock: Monotonic counter per device+entity

**Database constraint**:

```sql
ALTER TABLE transaction_events
ADD CONSTRAINT idempotency_key_unique UNIQUE (idempotency_key);
```

### Event Compaction Strategy

**Trigger conditions** (Decision #62):

- 100 events for same entity, OR
- Monthly compaction

**Process**:

1. Load all events for entity
2. Replay to get latest state
3. Create snapshot with full state
4. Delete individual events (keep snapshot)
5. Retain for 90 days

**Benefits**:

- Prevents unbounded growth
- Faster event replay
- Maintains audit trail via snapshots

---

**Ready to start?** → `chunks/026-device-hybrid-id/README.md`

**Completed Milestone 3?** Verify first:

```
Test offline reads/writes working before adding sync complexity
```

**Why sync engine?**

- Use on multiple devices (phone + laptop)
- Changes propagate automatically
- Conflicts resolve without user intervention
- Foundation for team/household features (future)
