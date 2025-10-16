# Troubleshooting: Sync Queue Schema

Common issues when creating and using the sync queue schema.

---

## Migration Issues

### Problem: Migration fails with "relation already exists"

**Symptoms**:

```
ERROR: relation "sync_queue" already exists
```

**Cause**: Table created in previous migration attempt

**Solution**:

Drop table and re-run:

```sql
DROP TABLE IF EXISTS sync_queue CASCADE;
```

Then run migration again:

```bash
npx supabase db push
```

---

### Problem: Migration fails with "type does not exist"

**Symptoms**:

```
ERROR: type "auth.users" does not exist
```

**Cause**: Auth schema not available

**Solution**:

Ensure using correct reference:

```sql
-- Correct
user_id UUID NOT NULL REFERENCES auth.users(id)

-- Also works
user_id UUID NOT NULL REFERENCES public.users(id)
```

---

## RLS Policy Issues

### Problem: Can't insert into sync_queue (RLS violation)

**Symptoms**:

```
new row violates row-level security policy for table "sync_queue"
```

**Cause**: Device not registered for user

**Solution**:

Register device first:

```sql
-- Check if device exists
SELECT * FROM devices WHERE user_id = auth.uid();

-- If not, insert device
INSERT INTO devices (id, user_id, household_id, name, platform)
VALUES (
  'device-test',
  auth.uid(),
  '00000000-0000-0000-0000-000000000001',
  'Test Device',
  'web'
);
```

---

### Problem: Can't see own queue items

**Symptoms**: SELECT returns empty even though items exist

**Cause**: RLS policy filtering incorrectly

**Solution**:

Check policy logic:

```sql
-- View policies
SELECT * FROM pg_policies WHERE tablename = 'sync_queue';

-- Test without RLS (as superuser)
SET ROLE postgres;
SELECT * FROM sync_queue WHERE user_id = '[YOUR-USER-ID]';
RESET ROLE;
```

Fix policy if needed:

```sql
DROP POLICY IF EXISTS "Users see own device queue" ON sync_queue;

CREATE POLICY "Users see own device queue"
ON sync_queue FOR SELECT
USING (user_id = auth.uid());
```

---

## Index Issues

### Problem: Queries slow on sync_queue

**Symptoms**: Queue processing takes >1s for 1000 items

**Cause**: Missing indexes

**Solution**:

Verify indexes exist:

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'sync_queue';
```

Add missing indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_sync_queue_status
ON sync_queue(status)
WHERE status IN ('queued', 'failed');
```

---

### Problem: Partial index not used

**Symptoms**: EXPLAIN shows seq scan instead of index scan

**Cause**: Query doesn't match index condition

**Solution**:

Ensure query matches partial index:

```sql
-- Won't use partial index
SELECT * FROM sync_queue WHERE status = 'completed';

-- Will use partial index
SELECT * FROM sync_queue WHERE status = 'queued';
```

---

## Constraint Issues

### Problem: Can't insert with invalid status

**Symptoms**:

```
ERROR: new row violates check constraint "sync_queue_status_check"
```

**Cause**: Status not in allowed values

**Solution**:

Use only allowed statuses:

```sql
-- Allowed: 'queued', 'syncing', 'completed', 'failed'

-- Wrong
INSERT INTO sync_queue (..., status) VALUES (..., 'pending');

-- Correct
INSERT INTO sync_queue (..., status) VALUES (..., 'queued');
```

---

### Problem: Retry count exceeds max_retries

**Symptoms**:

```
ERROR: new row violates check constraint "sync_queue_retry_check"
```

**Cause**: retry_count > max_retries

**Solution**:

Ensure constraint maintained:

```sql
-- Wrong
UPDATE sync_queue SET retry_count = 5 WHERE max_retries = 3;

-- Correct: increase max_retries first
UPDATE sync_queue SET max_retries = 5, retry_count = 5 WHERE id = '...';
```

---

## JSONB Issues

### Problem: Invalid JSON in operation field

**Symptoms**:

```
ERROR: invalid input syntax for type json
```

**Cause**: Malformed JSON

**Solution**:

Validate JSON before insert:

```typescript
// In TypeScript
const operation = {
  op: "create",
  payload: { description: "Test" },
  idempotencyKey: "key",
  lamportClock: 1,
  vectorClock: { "device-1": 1 },
};

// Stringify and parse to validate
const validated = JSON.parse(JSON.stringify(operation));

await supabase.from("sync_queue").insert({
  operation: validated, // Supabase will handle JSONB conversion
});
```

---

### Problem: Can't query JSONB fields

**Symptoms**: Need to filter by operation.op

**Solution**:

Use JSONB operators:

```sql
-- Get all create operations
SELECT * FROM sync_queue
WHERE operation->>'op' = 'create';

-- Get operations with specific entity
SELECT * FROM sync_queue
WHERE operation->'payload'->>'entity_id' = 'tx-123';

-- For better performance, add GIN index
CREATE INDEX idx_sync_queue_operation
ON sync_queue USING gin (operation);
```

---

## Trigger Issues

### Problem: updated_at not auto-updating

**Symptoms**: updated_at stays same after UPDATE

**Cause**: Trigger not created or not firing

**Solution**:

Check trigger exists:

```sql
SELECT tgname, tgtype, tgenabled
FROM pg_trigger
WHERE tgrelid = 'sync_queue'::regclass;
```

Recreate if missing:

```sql
CREATE OR REPLACE FUNCTION update_sync_queue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_queue_updated_at
BEFORE UPDATE ON sync_queue
FOR EACH ROW
EXECUTE FUNCTION update_sync_queue_timestamp();
```

---

## Cleanup Function Issues

### Problem: Cleanup function not removing old items

**Symptoms**: `cleanup_old_sync_queue()` returns 0 always

**Cause**: No items old enough OR synced_at is NULL

**Solution**:

Check item ages:

```sql
SELECT
  id,
  status,
  synced_at,
  now() - synced_at AS age
FROM sync_queue
WHERE status = 'completed'
ORDER BY synced_at DESC;
```

Ensure synced_at set when completing:

```sql
UPDATE sync_queue
SET status = 'completed',
    synced_at = now()  -- Must set this
WHERE id = '...';
```

---

## Performance Issues

### Problem: sync_queue table growing too large

**Symptoms**: Queries slow, storage increasing

**Cause**: Completed items not cleaned up

**Solution**:

Schedule cleanup:

```sql
-- Run cleanup manually
SELECT cleanup_old_sync_queue();

-- Or create cron job (Supabase Extensions → pg_cron)
SELECT cron.schedule(
  'cleanup-sync-queue',
  '0 2 * * *',  -- Daily at 2 AM
  $$SELECT cleanup_old_sync_queue()$$
);
```

---

### Problem: Queries timeout on large queues

**Symptoms**: Query takes >5s with 10k+ items

**Cause**: Missing compound indexes

**Solution**:

Add performance indexes:

```sql
-- For device-specific queue queries
CREATE INDEX idx_sync_queue_device_status_created
ON sync_queue(device_id, status, created_at)
WHERE status IN ('queued', 'syncing');

-- For retry logic
CREATE INDEX idx_sync_queue_retry
ON sync_queue(status, retry_count, updated_at)
WHERE status = 'failed';
```

---

## TypeScript Integration Issues

### Problem: Type mismatch between DB and TypeScript

**Symptoms**: TypeScript error when querying sync_queue

**Solution**:

Generate types from database:

```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

Use generated types:

```typescript
import type { Database } from "@/types/supabase";

type SyncQueueRow = Database["public"]["Tables"]["sync_queue"]["Row"];
type SyncQueueInsert = Database["public"]["Tables"]["sync_queue"]["Insert"];
```

---

## Prevention Tips

1. **Always validate JSON** before inserting to JSONB fields
2. **Use transactions** when updating multiple queue items
3. **Monitor table size** and run cleanup regularly
4. **Index strategically** based on actual query patterns
5. **Test RLS policies** with actual user accounts
6. **Document JSONB structure** for operation field
7. **Set synced_at** when marking completed

---

## Quick Fixes

```bash
# Reset sync_queue (in Supabase SQL Editor)
TRUNCATE sync_queue CASCADE;

# Check table size
SELECT
  pg_size_pretty(pg_total_relation_size('sync_queue')) AS total_size,
  COUNT(*) AS row_count
FROM sync_queue;

# Find stuck items
SELECT *
FROM sync_queue
WHERE status = 'syncing'
  AND updated_at < (now() - INTERVAL '1 hour');

# Reset stuck items
UPDATE sync_queue
SET status = 'queued', retry_count = retry_count + 1
WHERE status = 'syncing'
  AND updated_at < (now() - INTERVAL '1 hour');

# Vacuum table
VACUUM ANALYZE sync_queue;
```

---

**Remember**: The sync queue is critical infrastructure. Test thoroughly before relying on it for production data.
