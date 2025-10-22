# Checkpoint: Events Schema

Run these verifications to ensure everything works correctly.

---

## 1. Migration Applied Successfully ✓

```bash
npx supabase db diff
```

**Expected**: No diff (all migrations applied)

---

## 2. Transaction Events Table Exists ✓

In Supabase Dashboard → Table Editor:

- [ ] `transaction_events` table visible
- [ ] All 14 columns present (id, household_id, entity_type, entity_id, op, payload, actor_user_id, device_id, idempotency_key, event_version, lamport_clock, vector_clock, checksum, created_at)
- [ ] Primary key on `id`
- [ ] UNIQUE constraint on `idempotency_key`
- [ ] `entity_id` is UUID type (not TEXT)
- [ ] `actor_user_id` references `profiles(id)` (not auth.users)

---

## 3. CHECK Constraints Working ✓

```sql
-- Should FAIL (invalid entity_type)
INSERT INTO transaction_events (
  entity_type, entity_id, op, payload,
  actor_user_id, device_id, idempotency_key,
  lamport_clock, vector_clock, checksum
) VALUES (
  'invalid', gen_random_uuid(), 'create', '{}'::jsonb,
  auth.uid(),
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  'test-check-1', 1, '{}'::jsonb, 'check'
);
```

**Expected**: Error `violates check constraint "transaction_events_entity_type_check"`

```sql
-- Should FAIL (invalid op)
INSERT INTO transaction_events (
  entity_type, entity_id, op, payload,
  actor_user_id, device_id, idempotency_key,
  lamport_clock, vector_clock, checksum
) VALUES (
  'transaction', gen_random_uuid(), 'invalid_op', '{}'::jsonb,
  auth.uid(),
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  'test-check-2', 1, '{}'::jsonb, 'check'
);
```

**Expected**: Error `violates check constraint "transaction_events_op_check"`

---

## 4. Indexes Created ✓

```sql
SELECT indexname
FROM pg_indexes
WHERE tablename = 'transaction_events'
ORDER BY indexname;
```

**Expected**:

- idx_events_actor
- idx_events_created_at
- idx_events_device
- idx_events_entity
- idx_events_household
- idx_events_lamport
- transaction_events_idempotency_key_key
- transaction_events_pkey

---

## 5. Foreign Keys Enforced ✓

```sql
-- Should FAIL (invalid device_id)
INSERT INTO transaction_events (
  entity_type, entity_id, op, payload,
  actor_user_id, device_id, idempotency_key,
  lamport_clock, vector_clock, checksum
) VALUES (
  'transaction', gen_random_uuid(), 'create', '{}'::jsonb,
  auth.uid(),
  'nonexistent-device-id',  -- Invalid
  'test-fk-1', 1, '{}'::jsonb, 'check'
);
```

**Expected**: Error `violates foreign key constraint` (device_id must exist in devices table)

---

## 6. Idempotency Key Prevents Duplicates ✓

```sql
-- Insert first event
INSERT INTO transaction_events (
  entity_type, entity_id, op, payload,
  actor_user_id, device_id, idempotency_key,
  lamport_clock, vector_clock, checksum
) VALUES (
  'transaction', gen_random_uuid(), 'create', '{}'::jsonb,
  auth.uid(),
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  'duplicate-key-test', 1, '{}'::jsonb, 'check'
);

-- Try inserting with same idempotency_key
INSERT INTO transaction_events (
  entity_type, entity_id, op, payload,
  actor_user_id, device_id, idempotency_key,
  lamport_clock, vector_clock, checksum
) VALUES (
  'transaction', gen_random_uuid(), 'create', '{}'::jsonb,
  auth.uid(),
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  'duplicate-key-test',  -- Same key
  2, '{}'::jsonb, 'check2'
);
```

**Expected**: Second insert fails with `duplicate key value violates unique constraint`

**Clean up**:

```sql
DELETE FROM transaction_events WHERE idempotency_key = 'duplicate-key-test';
```

---

## 7. RLS Policies Active ✓

```sql
-- Check RLS enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'transaction_events';
```

**Expected**: `relrowsecurity` = true

```sql
-- Check policies exist
SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'transaction_events'::regclass;
```

**Expected**: 2 policies (SELECT and INSERT)

---

## 8. Can Insert Valid Event ✓

```sql
INSERT INTO transaction_events (
  entity_type,
  entity_id,
  op,
  payload,
  actor_user_id,
  device_id,
  idempotency_key,
  lamport_clock,
  vector_clock,
  checksum
) VALUES (
  'transaction',
  gen_random_uuid(),
  'create',
  '{"amount_cents": 50000, "description": "Checkpoint test"}'::jsonb,
  auth.uid(),
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  'checkpoint-test-key-' || extract(epoch from now())::text,
  1,
  jsonb_build_object(
    (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
    1
  ),
  encode(sha256('checkpoint-test'::bytea), 'hex')
)
RETURNING id, entity_id;
```

**Expected**: Success, 1 row inserted, returns event ID and entity ID

**Verify**:

```sql
SELECT
  entity_type,
  entity_id,
  op,
  payload->>'description' as description,
  lamport_clock
FROM transaction_events
WHERE idempotency_key LIKE 'checkpoint-test-key-%'
ORDER BY created_at DESC
LIMIT 1;
```

---

## 9. JSONB Payload Queryable ✓

```sql
-- Query by JSONB field
SELECT entity_id, payload->>'description' as description
FROM transaction_events
WHERE payload->>'description' IS NOT NULL
LIMIT 5;
```

**Expected**: Results show description field extracted from JSONB

---

## 10. Vector Clock Structure Valid ✓

```sql
SELECT
  entity_id,
  lamport_clock,
  vector_clock,
  jsonb_typeof(vector_clock) as clock_type
FROM transaction_events
WHERE idempotency_key LIKE 'checkpoint-test-key-%'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected**:

- `clock_type` = "object"
- `vector_clock` contains device IDs as keys
- Each value is a number

---

## 11. Cleanup Function Works ✓

```sql
-- Call cleanup function
SELECT cleanup_old_events();

-- Verify function exists
SELECT proname
FROM pg_proc
WHERE proname = 'cleanup_old_events';
```

**Expected**: Function executes without error

---

## 12. UPDATE and DELETE Blocked ✓

```sql
-- Should FAIL (no UPDATE policy - events are immutable)
UPDATE transaction_events
SET payload = '{"modified": true}'::jsonb
WHERE idempotency_key LIKE 'checkpoint-test-key-%';
```

**Expected**: 0 rows affected (RLS denies UPDATE) or permission denied error

```sql
-- Should FAIL (no DELETE policy - events are immutable)
DELETE FROM transaction_events
WHERE idempotency_key LIKE 'checkpoint-test-key-%';
```

**Expected**: 0 rows affected (RLS denies DELETE) or permission denied error

**Note**: In Supabase SQL Editor with service role, UPDATE/DELETE may succeed (bypasses RLS). Test with actual app client to verify RLS enforcement.

---

## Success Criteria

- [ ] Migration applied successfully
- [ ] transaction_events table exists with all columns
- [ ] CHECK constraints enforce valid entity_type and op
- [ ] Indexes created for performance
- [ ] Foreign keys enforce referential integrity
- [ ] Idempotency key prevents duplicate events
- [ ] RLS policies active (SELECT and INSERT)
- [ ] Can insert valid events
- [ ] JSONB payload queryable
- [ ] Vector clock structure valid
- [ ] Cleanup function works
- [ ] UPDATE and DELETE blocked for immutability

---

## Common Issues

### Issue: Foreign key constraint fails on device_id

**Solution**: Ensure devices table exists and you have a registered device:

```sql
SELECT id FROM devices WHERE user_id = auth.uid();
```

If empty, register device first (chunk 027).

### Issue: RLS blocks INSERT

**Solution**: Verify authenticated:

```sql
SELECT auth.uid();  -- Should return your user ID, not NULL
```

---

## Next Steps

Once all checkpoints pass:

1. Clean up test events
2. Commit events schema
3. Move to **Chunk 029: Idempotency Keys** (generate deterministic keys)

---

**Estimated Time**: 15-20 minutes to verify all checkpoints
