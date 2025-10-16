# Chunk 028: Events Schema

## At a Glance

- **Time**: 45 minutes
- **Milestone**: Multi-Device Sync (3 of 10)
- **Prerequisites**: Chunk 027 (devices table with device registration)
- **Can Skip**: No - foundation for event sourcing and sync

## What You're Building

Transaction events table for complete audit trails:

- SQL migration creating transaction_events table
- Event structure with all required fields (entity_type, entity_id, op, payload, lamport_clock, vector_clock)
- Indexes for efficient event queries
- Row-Level Security policies
- Event retention policy (90 days default)
- Checksum field for data integrity

## Why This Matters

Event sourcing is **the foundation of conflict-free sync**. Every mutation (create/update/delete) is stored as an immutable event, enabling:

- **Complete audit trail**: See who changed what, when, and from which device
- **Time-travel debugging**: Replay events to reconstruct state at any point
- **Conflict resolution**: Compare vector clocks to detect concurrent edits
- **Sync across devices**: Events are the units of synchronization
- **Rollback capability**: Undo changes by creating compensating events

Without event sourcing, multi-device sync would require complex merge logic with high risk of data loss.

## Before You Start

Make sure you have:

- Chunk 027 completed (devices table exists)
- Supabase migrations working
- Understanding of event sourcing concepts
- DeviceManager returning device IDs

## What Happens Next

After this chunk:

- transaction_events table stores all mutations
- Events have idempotency keys (prepared for chunk 029)
- Vector clocks ready for conflict resolution (Phase B)
- Audit trail visible in Supabase dashboard
- Ready to generate events on mutations (chunk 030)
- Foundation for sync processor (chunk 024)

## Key Files Created

```
supabase/
└── migrations/
    └── YYYYMMDDHHMMSS_add_transaction_events.sql   # Events table migration
```

## Features Included

### Transaction Events Schema

```sql
CREATE TABLE transaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What changed
  entity_type TEXT NOT NULL,         -- 'transaction' | 'account' | 'category' | 'budget'
  entity_id TEXT NOT NULL,           -- ID of the entity that changed
  op TEXT NOT NULL,                  -- 'create' | 'update' | 'delete'
  payload JSONB NOT NULL,            -- Changed fields (full record for create, delta for update)

  -- When and by whom
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,

  -- Idempotency and conflict resolution
  idempotency_key TEXT UNIQUE NOT NULL,  -- Prevents duplicate event processing
  event_version INT DEFAULT 1 NOT NULL,   -- Schema version for forward compatibility
  lamport_clock BIGINT NOT NULL,          -- Logical timestamp per entity
  vector_clock JSONB NOT NULL,            -- Per-device clocks for conflict detection

  -- Data integrity
  checksum TEXT NOT NULL,                 -- SHA-256 of payload for verification

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

### Indexes for Performance

- **entity_id + lamport_clock**: Query events for specific entity in order
- **device_id + timestamp**: Query events from specific device
- **idempotency_key**: Fast duplicate detection (UNIQUE constraint)
- **created_at**: Event retention cleanup
- **entity_type + entity_id**: Entity-specific event queries

### Row-Level Security

- Users can view events for their household data
- Users can create events (via app, not directly)
- Events are immutable (no UPDATE or DELETE)

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 99-128 (event structure)
- **Original**: `docs/initial plan/DATABASE.md` lines 500-600 (events table schema)
- **Decisions**:
  - #62: Event sourcing from Phase A (MVP)
  - #77: Deterministic conflict resolution with vector clocks
- **Architecture**: Immutable event log with eventual consistency

## Technical Stack

- **PostgreSQL**: JSONB for flexible payload storage
- **Supabase**: Realtime subscriptions to events
- **Vector Clocks**: Per-entity conflict detection (Phase B)
- **Lamport Clocks**: Logical ordering within entity

## Design Patterns

### Event Sourcing

```typescript
// Every mutation creates an event
await createTransaction({ amount: 1000 });
// Generates event:
// {
//   entity_type: 'transaction',
//   entity_id: 'tx-123',
//   op: 'create',
//   payload: { amount: 1000, ... }
// }
```

### Immutable Event Log

```typescript
// Events never change
// ❌ Cannot UPDATE or DELETE events
// ✅ Create new compensating event
await updateTransaction("tx-123", { amount: 2000 });
// Generates new event with op: 'update'
```

### Entity-Scoped Clocks

```typescript
// Each entity has independent lamport clock
{
  entity_id: 'tx-123',
  lamport_clock: 1, // First event for this transaction
  vector_clock: {
    'device-abc': 1,
    'device-xyz': 0
  }
}
```

## Event Retention Strategy

**Phase A (MVP)**: Keep all events (no automatic cleanup)

**Phase B**: Implement compaction (Decision #62):

- Keep last 100 events per entity OR
- Keep events from last 90 days
- Compact older events into snapshots

**Manual Cleanup** (for testing):

```sql
DELETE FROM transaction_events
WHERE created_at < NOW() - INTERVAL '90 days';
```

## Storage Considerations

**Event size**: ~500 bytes average

- entity_type, entity_id: ~50 bytes
- payload: ~200 bytes (delta updates smaller)
- vector_clock: ~100 bytes (grows with devices)
- Other fields: ~150 bytes

**Storage estimates**:

- 1,000 transactions/month × 2 events each (create + update) = 2,000 events
- 2,000 events × 500 bytes = ~1 MB/month
- 12 months = ~12 MB/year

Very manageable for Supabase free tier (500 MB).

## Performance Characteristics

- **Insert event**: ~10ms (indexed on idempotency_key)
- **Query events for entity**: ~5ms (indexed on entity_id + lamport_clock)
- **Query events by device**: ~8ms (indexed on device_id)
- **Full table scan**: Avoid with proper indexing

**Optimization**: Events are write-heavy, read during sync only. Indexes optimized for write performance.

## Testing Strategy

### Unit Tests

- Event insertion creates record
- Idempotency key prevents duplicates
- Lamport clock increments per entity
- Checksum validation

### Integration Tests

- Event generated on transaction create
- Event payload contains correct data
- RLS prevents unauthorized access
- Event replay reconstructs state

---

**Ready?** → Open `instructions.md` to begin
