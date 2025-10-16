# Chunk 022: Sync Queue Schema

## At a Glance

- **Time**: 30 minutes
- **Milestone**: Offline (4 of 7)
- **Prerequisites**: Chunk 021 (offline writes)
- **Can Skip**: No - required for sync functionality

## What You're Building

Database schema for tracking offline changes waiting to sync:

- `sync_queue` table with state tracking
- Indexes for efficient queue processing
- RLS policies for device-scoped access
- Database functions for queue operations
- Testing schema with sample data

## Why This Matters

The sync queue is the durable storage layer that ensures no data loss:

- **Persistence**: Survives app restarts and crashes
- **Retry logic**: Failed syncs can be retried
- **Ordering**: Maintains operation order per entity
- **Isolation**: Each device has its own queue
- **Atomicity**: Database transactions ensure consistency

## Before You Start

Make sure you have:

- Supabase project set up
- Database migration tooling configured
- Access to Supabase SQL editor
- Understanding of PostgreSQL basics

## What Happens Next

After this chunk:

- `sync_queue` table exists in Supabase
- RLS policies enforce device isolation
- Indexes optimize queue processing
- Ready for Chunk 023 (connect offline writes to queue)

## Key Files Created

```
supabase/
└── migrations/
    └── YYYYMMDD_create_sync_queue.sql    # Migration SQL
```

## Features Included

### sync_queue Table Schema

```sql
CREATE TABLE sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,          -- 'transaction' | 'account' | 'category' | 'budget'
  entity_id TEXT NOT NULL,            -- ID of entity being synced
  operation JSONB NOT NULL,           -- Operation details (op, payload)
  device_id TEXT NOT NULL,            -- Which device created this
  user_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL,               -- 'queued' | 'syncing' | 'completed' | 'failed'
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,

  CONSTRAINT sync_queue_status_check
    CHECK (status IN ('queued', 'syncing', 'completed', 'failed'))
);
```

### Indexes

- `idx_sync_queue_status`: Fast filtering by status
- `idx_sync_queue_device_status`: Device + status composite
- `idx_sync_queue_entity`: Entity type + ID lookup
- `idx_sync_queue_created`: Chronological processing

### RLS Policies

- **SELECT**: User can only see their own device's queue items
- **INSERT**: User can create queue items for their device
- **UPDATE**: User can update their own queue items
- **DELETE**: User can delete completed/failed items

### Database Functions

- `update_sync_queue_timestamp()`: Auto-update `updated_at`
- `cleanup_old_sync_queue()`: Remove completed items > 7 days old

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 131-224 (Sync State Machine)
- **Original**: `docs/initial plan/DATABASE.md` sync_queue table spec
- **Decisions**:
  - #62: Event sourcing from Phase A
  - #82: Devices table in MVP for tracking
- **Architecture**: Supabase as sync coordination layer

## Technical Stack

- **PostgreSQL**: Relational database for sync queue
- **Supabase**: Database hosting and RLS
- **UUID**: Primary keys for distributed system
- **JSONB**: Flexible operation payload storage

## Design Patterns

### Queue State Machine

```
queued → syncing → completed
       ↓ (on error)
     failed → queued (retry)
```

### Operation Payload Format

```json
{
  "op": "create" | "update" | "delete",
  "payload": {
    // Entity-specific data
  },
  "idempotencyKey": "device-entity-lamport",
  "lamportClock": 5,
  "vectorClock": { "device1": 5, "device2": 3 }
}
```

### Device Isolation Pattern

```sql
-- User can only see items from their devices
CREATE POLICY "Users see own device queue"
ON sync_queue FOR SELECT
USING (
  device_id IN (
    SELECT id FROM devices WHERE user_id = auth.uid()
  )
);
```

## Critical Concepts

**Queue Processing Order**:

- Process oldest first (`ORDER BY created_at ASC`)
- Per-entity ordering matters
- Global ordering less important

**Retry Strategy**:

- Max 3 retries by default
- Exponential backoff in processor (chunk 024)
- Failed items remain for manual review

**Cleanup Strategy**:

- Keep completed items for 7 days (audit trail)
- Keep failed items indefinitely (manual review)
- Delete automatically via cron

**Device Isolation**:

- Each device maintains its own queue
- No cross-device queue visibility
- Prevents accidental conflict

---

**Ready?** → Open `instructions.md` to begin
