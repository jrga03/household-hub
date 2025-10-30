# Checkpoint: Sync Queue Schema

Run these verifications to ensure the schema is correct.

---

## 1. Migration Applied Successfully ✓

```bash
npx supabase db push
```

**Expected**:

```
Applying migration...
Successfully applied migration
```

No errors during migration.

---

## 2. Table Exists and Has Correct Schema ✓

**In Supabase SQL Editor**:

```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'sync_queue'
ORDER BY ordinal_position;
```

**Expected columns**:

- id (uuid, not null)
- household_id (uuid, not null, default '00000000-0000-0000-0000-000000000001')
- entity_type (text, not null)
- entity_id (text, not null) -- TEXT type (not UUID) for temp offline IDs
- operation (jsonb, not null)
- device_id (text, not null)
- user_id (uuid, not null) -- Added for RLS policies
- status (text, not null, default 'queued')
- retry_count (integer, not null, default 0)
- max_retries (integer, not null, default 3) -- Enhancement beyond DATABASE.md
- error_message (text, nullable)
- created_at (timestamptz, not null, default now())
- updated_at (timestamptz, not null, default now())
- synced_at (timestamptz, nullable) -- Enhancement for cleanup function

---

## 3. Constraints Exist ✓

```sql
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'sync_queue';
```

**Expected constraints**:

- sync_queue_pkey (PRIMARY KEY)
- sync_queue_status_check (CHECK)
- sync_queue_entity_type_check (CHECK)
- sync_queue_retry_check (CHECK)
- sync_queue_user_id_fkey (FOREIGN KEY)

---

## 4. Indexes Created ✓

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'sync_queue';
```

**Expected indexes**:

- idx_sync_queue_status
- idx_sync_queue_device_status
- idx_sync_queue_entity
- idx_sync_queue_created
- idx_sync_queue_cleanup
- idx_sync_queue_user_device

---

## 5. RLS Enabled ✓

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'sync_queue';
```

**Expected**: `rowsecurity = true`

---

## 6. RLS Policies Exist ✓

```sql
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'sync_queue';
```

**Expected policies**:

- Users see own sync queue (SELECT)
- Users insert own sync queue (INSERT)
- Users update own sync queue (UPDATE)
- Users delete completed sync queue (DELETE)

**Note**: Policies are simplified for Milestone 3. After chunk 027 (devices table exists), these will be upgraded in chunk 028 to include device ownership verification.

---

## 6.5. Verify household_id Default ✓

```sql
-- Check household_id has correct default
SELECT column_default
FROM information_schema.columns
WHERE table_name = 'sync_queue'
  AND column_name = 'household_id';
```

**Expected**: `'00000000-0000-0000-0000-000000000001'::uuid`

---

## 7. Trigger Works ✓

```sql
-- Insert test item
INSERT INTO sync_queue (
  entity_type, entity_id, operation, device_id, user_id
) VALUES (
  'transaction', 'test-trigger', '{}'::jsonb, 'device-1', auth.uid()
) RETURNING id, created_at, updated_at;

-- Wait 2 seconds
SELECT pg_sleep(2);

-- Update and verify timestamp changed
UPDATE sync_queue
SET status = 'syncing'
WHERE entity_id = 'test-trigger'
RETURNING updated_at > created_at AS timestamp_updated;

-- Cleanup
DELETE FROM sync_queue WHERE entity_id = 'test-trigger';
```

**Expected**: `timestamp_updated = true`

---

## 8. Cleanup Function Works ✓

```sql
-- Test cleanup function exists
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'cleanup_old_sync_queue';

-- Call it (should return 0 if no old data)
SELECT cleanup_old_sync_queue();
```

**Expected**: Function exists and returns a number

---

## 9. Can Insert Queue Items ✓

```sql
-- Insert with all fields
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
  'temp-test-123',  -- Temporary offline ID (TEXT type)
  '{"op": "create", "payload": {"description": "Test"}}'::jsonb,
  'device-test',
  auth.uid(),
  'queued'
) RETURNING id;

-- Verify insert
SELECT * FROM sync_queue WHERE entity_id = 'temp-test-123';

-- Cleanup
DELETE FROM sync_queue WHERE entity_id = 'temp-test-123';
```

**Expected**: Insert succeeds, data returned

---

## 10. Can Update Queue Status ✓

```sql
-- Create test item
INSERT INTO sync_queue (
  entity_type, entity_id, operation, device_id, user_id
) VALUES (
  'transaction', 'test-update', '{}'::jsonb, 'device-1', auth.uid()
) RETURNING id;

-- Update to syncing
UPDATE sync_queue
SET status = 'syncing'
WHERE entity_id = 'test-update'
RETURNING status;

-- Update to completed
UPDATE sync_queue
SET status = 'completed', synced_at = now()
WHERE entity_id = 'test-update'
RETURNING status, synced_at;

-- Cleanup
DELETE FROM sync_queue WHERE entity_id = 'test-update';
```

**Expected**: All status transitions succeed

---

## 11. RLS Policies Enforced ✓

**Test in Supabase SQL Editor as authenticated user**:

```sql
-- This should work (own user_id)
INSERT INTO sync_queue (
  household_id,
  entity_type,
  entity_id,
  operation,
  device_id,
  user_id
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'transaction',
  'test-rls',
  '{}'::jsonb,
  'device-test',
  auth.uid()  -- Current user
);

-- This should fail (different user_id)
INSERT INTO sync_queue (
  household_id,
  entity_type,
  entity_id,
  operation,
  device_id,
  user_id
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'transaction',
  'test-rls-fail',
  '{}'::jsonb,
  'device-test',
  '00000000-0000-0000-0000-000000000000'  -- Different user
);
-- Expected error: new row violates row-level security policy

-- Cleanup
DELETE FROM sync_queue WHERE entity_id = 'test-rls';
```

---

## 12. TypeScript Types Match Schema ✓

Verify `src/types/sync.ts` exports:

- `SyncQueueStatus`
- `EntityType`
- `SyncQueueOperation`
- `SyncQueueItem`

**Run type check**:

```bash
npm run type-check
```

No errors in sync types.

---

## Success Criteria

- [ ] Migration applied without errors
- [ ] Table exists with all columns
- [ ] All constraints created
- [ ] All indexes created
- [ ] RLS enabled
- [ ] All 5 RLS policies active
- [ ] Trigger auto-updates timestamps
- [ ] Cleanup function exists and works
- [ ] Can insert queue items
- [ ] Can update status (queued → syncing → completed)
- [ ] RLS policies enforce access control
- [ ] TypeScript types defined

---

## Common Issues

### Migration fails with "relation already exists"

**Solution**: Drop table and retry:

```sql
DROP TABLE IF EXISTS sync_queue CASCADE;
```

Then run migration again.

### RLS policies block inserts

**Solution**: Ensure you're authenticated and using `auth.uid()` for user_id. The simplified RLS policies (Milestone 3) only require matching user_id. Device ownership verification is added in chunk 028 after the devices table exists.

### Trigger doesn't update timestamp

**Solution**: Verify trigger exists:

```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'sync_queue'::regclass;
```

---

## Next Steps

Once all checkpoints pass:

1. Commit migration file
2. Move to **Chunk 023: Offline Writes Queue**
3. Connect offline writes to sync queue

---

**Estimated Time**: 15-20 minutes to verify all checkpoints
