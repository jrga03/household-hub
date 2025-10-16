# Troubleshooting: Events Schema

Common issues and solutions when working with the transaction_events table.

---

## Migration Issues

### Problem: "relation devices does not exist"

**Symptoms**: Foreign key constraint fails during migration

**Solution**: Ensure devices table created first (chunk 027):

```bash
npx supabase migration list | grep devices
```

Apply devices migration before events migration.

---

### Problem: CHECK constraint syntax error

**Symptoms**: `syntax error at or near "CHECK"`

**Solution**: Ensure CHECK constraint uses correct syntax:

```sql
-- Correct:
entity_type TEXT NOT NULL CHECK (
  entity_type IN ('transaction', 'account', 'category', 'budget')
),

-- Incorrect (missing comma):
entity_type TEXT NOT NULL CHECK (...)
op TEXT NOT NULL CHECK (...)  -- ❌ Missing comma above
```

---

## INSERT Issues

### Problem: "null value in column violates not-null constraint"

**Symptoms**: Cannot insert event due to missing required field

**Solution**: Ensure all NOT NULL fields provided:

```typescript
// Required fields
{
  (entity_type, // ✓
    entity_id, // ✓
    op, // ✓
    payload, // ✓
    actor_user_id, // ✓
    device_id, // ✓
    idempotency_key, // ✓
    lamport_clock, // ✓
    vector_clock, // ✓
    checksum); // ✓
}
```

---

### Problem: "duplicate key value violates unique constraint"

**Symptoms**: Idempotency key already exists

**Solution**: This is expected behavior! The idempotency key prevents duplicate event processing. Check if event was already created:

```sql
SELECT * FROM transaction_events
WHERE idempotency_key = 'your-key-here';
```

If duplicate is unintentional, use different idempotency key format.

---

### Problem: Foreign key violation on device_id

**Symptoms**: `violates foreign key constraint "transaction_events_device_id_fkey"`

**Solution**: Verify device exists:

```sql
SELECT id FROM devices WHERE id = 'your-device-id';
```

If empty, register device first (chunk 027):

```typescript
await registerDevice(userId, householdId);
```

---

## JSONB Issues

### Problem: Invalid JSON in payload or vector_clock

**Symptoms**: `invalid input syntax for type json`

**Solution**: Ensure proper JSON formatting:

```typescript
// Correct:
payload: JSON.stringify({ amount: 1000 })
vector_clock: JSON.stringify({ "device-abc": 1 })

// Or use JSONB cast in SQL:
payload: '{"amount": 1000}'::jsonb
```

---

### Problem: Cannot query JSONB fields

**Symptoms**: JSONB operators not working

**Solution**: Use correct JSONB operators:

```sql
-- Extract text value
payload->>'description'

-- Extract JSON value
payload->'amount_cents'

-- Check existence
payload ? 'description'

-- Contains
payload @> '{"status": "pending"}'::jsonb
```

---

## RLS Policy Issues

### Problem: Cannot insert events

**Symptoms**: `new row violates row-level security policy`

**Solution**: Verify INSERT policy allows user:

```sql
-- Check policy
SELECT polname, polcmd, polwithcheck
FROM pg_policy
WHERE polrelid = 'transaction_events'::regclass
  AND polcmd = 'INSERT';

-- Verify user authenticated
SELECT auth.uid();  -- Should not be NULL
```

---

### Problem: Cannot view own events

**Symptoms**: SELECT returns empty even with events

**Solution**: Check SELECT policy:

```sql
-- Policy should allow user to see their events
CREATE POLICY "Users can view events for their household"
  ON transaction_events FOR SELECT
  USING (actor_user_id = auth.uid());
```

Note: Current policy only shows events created by current user. To see all household events, need join with household membership.

---

## Performance Issues

### Problem: Slow event queries

**Symptoms**: Queries take >100ms for small datasets

**Solution**: Verify indexes used:

```sql
EXPLAIN ANALYZE
SELECT * FROM transaction_events
WHERE entity_id = 'tx-123'
ORDER BY lamport_clock;
```

Should show `Index Scan using idx_events_entity`.

If using Seq Scan, indexes may not be created:

```sql
-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_events_entity
  ON transaction_events(entity_type, entity_id, lamport_clock);
```

---

### Problem: Large vector_clock field

**Symptoms**: Events >1KB each, slow inserts

**Solution**: Implement vector clock compaction (Phase B):

```typescript
// Remove inactive devices from vector clock
function compactVectorClock(vectorClock: VectorClock): VectorClock {
  const compacted = {};
  let maxInactive = 0;

  for (const [deviceId, clock] of Object.entries(vectorClock)) {
    if (isDeviceActive(deviceId)) {
      compacted[deviceId] = clock;
    } else {
      maxInactive = Math.max(maxInactive, clock);
    }
  }

  if (maxInactive > 0) {
    compacted["_historical"] = maxInactive;
  }

  return compacted;
}
```

---

## Checksum Issues

### Problem: Checksum validation fails

**Symptoms**: Computed checksum doesn't match stored checksum

**Solution**: Ensure consistent payload normalization:

```typescript
function calculateChecksum(payload: any): string {
  // Normalize: sort keys, remove timestamps
  const normalized = normalizePayload(payload);
  const json = JSON.stringify(normalized);
  return sha256(json);
}

function normalizePayload(obj: any): any {
  if (typeof obj !== "object" || obj === null) return obj;

  const sorted: any = {};
  Object.keys(obj)
    .sort() // Alphabetical order
    .forEach((key) => {
      if (key !== "updated_at" && key !== "created_at") {
        sorted[key] = normalizePayload(obj[key]);
      }
    });
  return sorted;
}
```

---

## Immutability Issues

### Problem: Need to "fix" incorrect event

**Symptoms**: Event has wrong data, want to UPDATE

**Solution**: Events are immutable. Create compensating event:

```typescript
// Don't UPDATE existing event
// ❌ await supabase.from('transaction_events').update(...)

// Create new event with correction
// ✓ await createEvent({
//     entity_type: 'transaction',
//     entity_id: 'tx-123',
//     op: 'update',
//     payload: { amount_cents: 2000 }, // Corrected value
//   })
```

---

## Testing Issues

### Problem: Test events pollute production data

**Symptoms**: Test events visible in production

**Solution**: Use separate test database:

```bash
# In CI/CD
export DATABASE_URL=$TEST_DATABASE_URL
npx supabase db reset
npm test
```

Or delete test events after each test:

```sql
DELETE FROM transaction_events
WHERE entity_id LIKE 'test-%';
```

---

## Prevention Tips

1. **Always validate idempotency keys**: Prevent accidental duplicates
2. **Normalize payloads**: Consistent checksums
3. **Test RLS policies**: Ensure proper isolation
4. **Monitor table size**: Alert if >1M events (time for compaction)
5. **Verify indexes**: Check EXPLAIN plans for key queries
6. **Test immutability**: Ensure UPDATE/DELETE blocked

---

## Getting Help

If you're stuck:

1. Check this troubleshooting guide first
2. Verify migration applied: `npx supabase db diff`
3. Check RLS policies: Query `pg_policy` table
4. Test in SQL Editor: Isolate issue
5. Review SYNC-ENGINE.md lines 99-128 for event structure
6. Check DECISIONS.md #62 for event sourcing rationale

---

## Quick Fixes

```bash
# Reset and reapply
npx supabase db reset

# Regenerate types
npx supabase gen types typescript --local > src/types/supabase.ts

# Check event count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM transaction_events;"

# View recent events
psql $DATABASE_URL -c "SELECT entity_type, entity_id, op, created_at FROM transaction_events ORDER BY created_at DESC LIMIT 10;"
```

---

**Remember**: Events are the foundation of sync. Test thoroughly before generating events on every mutation.
