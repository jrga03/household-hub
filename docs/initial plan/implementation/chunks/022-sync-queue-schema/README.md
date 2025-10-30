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

- **Chunk 019 completed** (Dexie setup - device ID persistence working)
- **Chunk 020 completed** (offline reads functional)
- **Chunk 021 completed** (offline write functions created)
- Supabase project set up
- Database migration tooling configured (`npx supabase migration new` working)
- Access to Supabase SQL editor
- Understanding of PostgreSQL basics (indexes, RLS policies, triggers)

**Important**: The devices table is created in chunk 027 (Milestone 4). This chunk uses simplified RLS policies that will be upgraded in chunk 028.

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

## Technical Notes

### Schema Enhancements Beyond DATABASE.md

This chunk implements the sync_queue schema with intentional improvements:

**Fields Added**:

1. **household_id**: Not strictly necessary (sync queue is device-scoped), but included for consistency with other tables and future multi-household support (Decision #61)

2. **user_id**: Added beyond DATABASE.md spec to enable:
   - RLS policies scoped to user's queue items
   - Cascade deletion when user deleted (ON DELETE CASCADE)
   - Faster queries (avoid JOIN to devices table via device_id)
   - This field is technically redundant with `device_id → devices.user_id`, but improves query performance and RLS clarity

3. **max_retries**: Allows per-item retry configuration (DATABASE.md only has retry_count). Default is 3, but can be increased for critical operations

4. **synced_at**: Timestamp when item completed sync. Enables the cleanup function to identify old completed items. DATABASE.md has created_at/updated_at but not synced_at

**Type Differences**:

- **entity_id**: TEXT instead of UUID (DATABASE.md has UUID)
  - **Rationale**: Offline-created entities use temporary IDs like `"temp-abc123"` (not UUIDs)
  - sync_queue must store these temp IDs before sync
  - Chunk 024 (sync processor) remaps temp IDs to server UUIDs after successful sync
  - See chunk 021 troubleshooting.md for temp ID format specification

**Additional Constraints**:

- `sync_queue_entity_type_check`: Validates entity_type values
- `sync_queue_retry_check`: Ensures retry_count ≤ max_retries
- More comprehensive than DATABASE.md for data integrity

### RLS Policy Evolution

**Milestone 3 (This Chunk)**:

Simplified RLS policies scoped to `user_id` only:

```sql
USING (user_id = auth.uid())
```

**Why Simplified?** The devices table doesn't exist until chunk 027 (Milestone 4). Cannot reference tables from future chunks.

**Milestone 4 (Chunk 028)**:

After devices table exists, policies will be upgraded to device-scoped:

```sql
USING (
  user_id = auth.uid()
  AND device_id IN (SELECT id FROM devices WHERE user_id = auth.uid())
)
```

This adds device ownership verification, preventing one user device from accessing another user's queue.

### Cleanup Strategy

The `cleanup_old_sync_queue()` function (step 6) removes completed items older than 7 days:

- **Keep completed**: 7 days (for debugging and audit trail)
- **Keep failed**: Indefinitely (manual review required)
- **Execution**: Manual via `SELECT cleanup_old_sync_queue()` OR automated cron (Phase C)

**Why 7 days?** Balances:

- Short enough to prevent bloat (1000 transactions/week = ~7k items)
- Long enough for debugging sync issues
- Users typically resolve sync issues within 1-2 days

### Index Strategy

This chunk uses **partial indexes** for better performance:

```sql
CREATE INDEX idx_sync_queue_status
ON sync_queue(status)
WHERE status IN ('queued', 'failed');  -- Only index active items
```

**Benefits**:

- Smaller index size (ignores completed items)
- Faster queries (PostgreSQL optimizer chooses index more often)
- Less maintenance (completed items don't bloat index)

See DATABASE.md lines 1161-1346 for complete indexing patterns.

### Relationship to Other Chunks

**Depends On**:

- Chunk 019: Dexie schema with syncQueue table
- Chunk 021: Offline write functions that will populate this queue

**Used By**:

- Chunk 023: Offline writes queue (adds items to sync_queue)
- Chunk 024: Sync processor (processes queued items)
- Chunk 025: Online detection (triggers sync processor)
- Chunk 028: RLS policy upgrade (after devices table exists)

---

**Ready?** → Open `instructions.md` to begin
