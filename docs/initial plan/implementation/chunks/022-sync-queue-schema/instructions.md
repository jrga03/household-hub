# Instructions: Sync Queue Schema

Follow these steps in order. Estimated time: 30 minutes.

---

## Step 1: Create Migration File (5 min)

Create migration file:

```bash
npx supabase migration new create_sync_queue
```

This creates: `supabase/migrations/YYYYMMDD_create_sync_queue.sql`

---

## Step 2: Add sync_queue Table Schema (10 min)

Edit the migration file and add:

```sql
-- Create sync_queue table for offline changes
CREATE TABLE sync_queue (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Household (for consistency with other tables - Decision #61)
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,

  -- Entity reference
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,  -- TEXT (not UUID) to support temporary offline IDs like "temp-abc123"

  -- Operation details
  operation JSONB NOT NULL,

  -- Tracking
  device_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Added for RLS policies and cascade deletion

  -- Queue state
  status TEXT NOT NULL DEFAULT 'queued',
  retry_count INTEGER DEFAULT 0 NOT NULL,
  max_retries INTEGER DEFAULT 3 NOT NULL,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  synced_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT sync_queue_status_check
    CHECK (status IN ('queued', 'syncing', 'completed', 'failed')),

  CONSTRAINT sync_queue_entity_type_check
    CHECK (entity_type IN ('transaction', 'account', 'category', 'budget')),

  CONSTRAINT sync_queue_retry_check
    CHECK (retry_count >= 0 AND retry_count <= max_retries)
);

-- Add table comment
COMMENT ON TABLE sync_queue IS 'Queue of offline changes waiting to sync to server';

-- Add column comments
COMMENT ON COLUMN sync_queue.household_id IS 'Household scope (hardcoded for MVP - Decision #61)';
COMMENT ON COLUMN sync_queue.entity_type IS 'Type of entity: transaction, account, category, budget';
COMMENT ON COLUMN sync_queue.entity_id IS 'ID of entity being synced (may be temporary offline ID like "temp-abc123")';
COMMENT ON COLUMN sync_queue.operation IS 'JSONB containing: op, payload, idempotencyKey, lamportClock, vectorClock';
COMMENT ON COLUMN sync_queue.device_id IS 'Device that created this queue item';
COMMENT ON COLUMN sync_queue.user_id IS 'User who owns this queue item (enables RLS policies)';
COMMENT ON COLUMN sync_queue.status IS 'Queue state: queued → syncing → completed OR failed';
COMMENT ON COLUMN sync_queue.retry_count IS 'Number of sync attempts';
COMMENT ON COLUMN sync_queue.max_retries IS 'Maximum retry attempts before permanent failure';
COMMENT ON COLUMN sync_queue.synced_at IS 'Timestamp when sync completed (enables cleanup)';
```

---

## Step 3: Create Indexes (5 min)

Add performance indexes:

```sql
-- Index for filtering by status (most common query)
CREATE INDEX idx_sync_queue_status
ON sync_queue(status)
WHERE status IN ('queued', 'failed');

-- Composite index for device + status queries
CREATE INDEX idx_sync_queue_device_status
ON sync_queue(device_id, status)
WHERE status IN ('queued', 'syncing');

-- Index for entity lookups
CREATE INDEX idx_sync_queue_entity
ON sync_queue(entity_type, entity_id);

-- Index for chronological processing (oldest first)
CREATE INDEX idx_sync_queue_created
ON sync_queue(created_at ASC)
WHERE status = 'queued';

-- Index for cleanup (find old completed items)
CREATE INDEX idx_sync_queue_cleanup
ON sync_queue(synced_at)
WHERE status = 'completed';

-- Composite index for user's queue
CREATE INDEX idx_sync_queue_user_device
ON sync_queue(user_id, device_id, status);
```

---

## Step 4: Create Auto-Update Trigger (3 min)

Add trigger to auto-update `updated_at`:

```sql
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sync_queue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on sync_queue updates
CREATE TRIGGER sync_queue_updated_at
BEFORE UPDATE ON sync_queue
FOR EACH ROW
EXECUTE FUNCTION update_sync_queue_timestamp();
```

---

## Step 5: Create RLS Policies (7 min)

Enable RLS and create policies:

```sql
-- Enable Row Level Security
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

-- NOTE: These are simplified RLS policies for Milestone 3 (Offline).
-- The devices table doesn't exist until chunk 027 (Milestone 4).
-- In chunk 028, these policies will be upgraded to include device ownership verification.

-- Policy: Users can see their own queue items
CREATE POLICY "Users see own sync queue"
ON sync_queue
FOR SELECT
USING (user_id = auth.uid());

-- Policy: Users can insert queue items for themselves
CREATE POLICY "Users insert own sync queue"
ON sync_queue
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own queue items
CREATE POLICY "Users update own sync queue"
ON sync_queue
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own completed/failed items
CREATE POLICY "Users delete completed sync queue"
ON sync_queue
FOR DELETE
USING (
  user_id = auth.uid()
  AND status IN ('completed', 'failed')
);

-- NOTE: After chunk 027 (devices table exists), upgrade to device-scoped policies:
-- USING (
--   user_id = auth.uid()
--   AND device_id IN (SELECT id FROM devices WHERE user_id = auth.uid())
-- )
```

---

## Step 6: Create Cleanup Function (5 min)

Add function to cleanup old queue items:

```sql
-- Function to clean up old completed sync queue items
CREATE OR REPLACE FUNCTION cleanup_old_sync_queue()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete completed items older than 7 days
  DELETE FROM sync_queue
  WHERE status = 'completed'
    AND synced_at < (now() - INTERVAL '7 days');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION cleanup_old_sync_queue() TO authenticated;

-- Add comment
COMMENT ON FUNCTION cleanup_old_sync_queue() IS 'Deletes completed sync queue items older than 7 days';
```

---

## Step 7: Run Migration (3 min)

Apply migration to database:

```bash
npx supabase db push
```

**Expected output**:

```
Applying migration YYYYMMDD_create_sync_queue.sql...
Successfully applied migration
```

---

## Step 8: Verify Schema (5 min)

Check in Supabase dashboard:

1. Navigate to **Database** → **Tables**
2. Find `sync_queue` table
3. **Expected columns**:
   - id (uuid)
   - entity_type (text)
   - entity_id (text)
   - operation (jsonb)
   - device_id (text)
   - user_id (uuid)
   - status (text)
   - retry_count (int4)
   - max_retries (int4)
   - error_message (text)
   - created_at (timestamptz)
   - updated_at (timestamptz)
   - synced_at (timestamptz)

4. Check **Indexes** tab:
   - idx_sync_queue_status
   - idx_sync_queue_device_status
   - idx_sync_queue_entity
   - idx_sync_queue_created
   - idx_sync_queue_cleanup
   - idx_sync_queue_user_device

5. Check **Policies** tab:
   - "Users see own device queue"
   - "Users insert for own devices"
   - "Users update own queue items"
   - "Users delete own completed items"
   - "Service role full access"

---

## Step 9: Test with Sample Data (10 min)

Insert test data via SQL Editor:

```sql
-- Test: Insert sample queue item
INSERT INTO sync_queue (
  household_id,
  entity_type,
  entity_id,
  operation,
  device_id,
  user_id,
  status
) VALUES (
  '00000000-0000-0000-0000-000000000001',  -- Default household
  'transaction',
  'temp-abc123',  -- Temporary offline ID (TEXT type)
  '{"op": "create", "payload": {"description": "Test", "amount_cents": 100000}}'::jsonb,
  'device-test-123',
  auth.uid(), -- Current user
  'queued'
);

-- Verify insert
SELECT * FROM sync_queue WHERE entity_id = 'temp-abc123';

-- Test: Update status
UPDATE sync_queue
SET status = 'syncing'
WHERE entity_id = 'temp-abc123';

-- Verify updated_at changed
SELECT id, status, created_at, updated_at
FROM sync_queue
WHERE entity_id = 'temp-abc123';

-- Test: Mark completed
UPDATE sync_queue
SET status = 'completed',
    synced_at = now()
WHERE entity_id = 'temp-abc123';

-- Test: Cleanup function
SELECT cleanup_old_sync_queue();
-- Should return 0 (nothing old enough to delete yet)

-- Clean up test data
DELETE FROM sync_queue WHERE entity_id = 'temp-abc123';
```

**Expected**: All queries succeed, RLS policies enforced

---

## Step 10: Create TypeScript Types (5 min)

Add type definitions in `src/types/sync.ts`:

```typescript
export type SyncQueueStatus = "queued" | "syncing" | "completed" | "failed";

export type EntityType = "transaction" | "account" | "category" | "budget";

export interface SyncQueueOperation {
  op: "create" | "update" | "delete";
  payload: any;
  idempotencyKey: string;
  lamportClock: number;
  vectorClock: Record<string, number>;
}

export interface SyncQueueItem {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  operation: SyncQueueOperation;
  device_id: string;
  user_id: string;
  status: SyncQueueStatus;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}
```

---

## Done!

When the migration is applied and types are created, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Status Flow**:

- New items start as `queued`
- Processor (chunk 024) moves to `syncing`
- Success → `completed`, error → `failed`
- Failed items can retry (moves back to `queued`)

**JSONB Operation Format**:

```json
{
  "op": "create",
  "payload": { "description": "Groceries", "amount_cents": 50000 },
  "idempotencyKey": "device-abc-transaction-xyz-5",
  "lamportClock": 5,
  "vectorClock": { "device-abc": 5 }
}
```

**Index Strategy**:

- Partial indexes for better performance
- Only index active statuses (queued/syncing/failed)
- Completed items indexed separately for cleanup

**RLS Security**:

- Users can only see/modify their own device's queue
- Service role bypasses RLS for cron cleanup
- Device ownership verified via `devices` table
