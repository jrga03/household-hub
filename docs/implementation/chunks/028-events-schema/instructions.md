# Instructions: Events Schema

Follow these steps in order. Estimated time: 45 minutes.

---

## Step 1: Create Migration for Transaction Events Table (20 min)

Create a new migration:

```bash
npx supabase migration new add_transaction_events
```

Open the migration file and add:

```sql
-- Transaction Events table for event sourcing
-- All mutations stored as immutable events for audit trail and sync

CREATE TABLE transaction_events (
  -- Event identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What changed
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('transaction', 'account', 'category', 'budget')
  ),
  entity_id TEXT NOT NULL,           -- ID of the specific entity
  op TEXT NOT NULL CHECK (
    op IN ('create', 'update', 'delete')
  ),
  payload JSONB NOT NULL,            -- Changed data (full for create, delta for update)

  -- When and by whom
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,

  -- Idempotency and versioning
  idempotency_key TEXT UNIQUE NOT NULL,
  event_version INT DEFAULT 1 NOT NULL,

  -- Conflict resolution (per-entity clocks)
  lamport_clock BIGINT NOT NULL,     -- Logical timestamp for this entity
  vector_clock JSONB NOT NULL,       -- Per-device clocks: { device_id: clock_value }

  -- Data integrity
  checksum TEXT NOT NULL,            -- SHA-256 hash of payload

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for common query patterns
-- Query events for specific entity in chronological order
CREATE INDEX idx_events_entity ON transaction_events(entity_type, entity_id, lamport_clock);

-- Query events from specific device
CREATE INDEX idx_events_device ON transaction_events(device_id, timestamp);

-- Query events by timestamp (for sync and retention)
CREATE INDEX idx_events_created_at ON transaction_events(created_at);

-- Query events by actor (audit trail)
CREATE INDEX idx_events_actor ON transaction_events(actor_user_id, timestamp);

-- Lamport clock lookups for next value
CREATE INDEX idx_events_lamport ON transaction_events(entity_id, lamport_clock DESC);

-- Row Level Security
ALTER TABLE transaction_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- SELECT: Users can view events for entities they can access
-- This uses household_id from the entity being modified
-- For simplicity in Phase A, allow users to see all household events
CREATE POLICY "Users can view events for their household"
  ON transaction_events FOR SELECT
  USING (
    actor_user_id IN (
      SELECT id FROM auth.users WHERE id = auth.uid()
    )
  );

-- INSERT: Users can create events (via app logic, not direct inserts)
CREATE POLICY "Users can create events"
  ON transaction_events FOR INSERT
  WITH CHECK (actor_user_id = auth.uid());

-- UPDATE/DELETE: Prohibited (events are immutable)
-- No policies needed - default deny

-- Comments for documentation
COMMENT ON TABLE transaction_events IS 'Immutable event log for event sourcing. Every mutation generates an event for audit trail and multi-device sync.';
COMMENT ON COLUMN transaction_events.entity_type IS 'Type of entity being modified (transaction, account, category, budget).';
COMMENT ON COLUMN transaction_events.entity_id IS 'ID of the specific entity. Scopes lamport_clock and vector_clock to this entity.';
COMMENT ON COLUMN transaction_events.op IS 'Operation type: create (full record), update (changed fields only), delete (mark as deleted).';
COMMENT ON COLUMN transaction_events.payload IS 'JSONB payload. For create: full record. For update: only changed fields. For delete: deletion metadata.';
COMMENT ON COLUMN transaction_events.idempotency_key IS 'Unique key to prevent duplicate event processing. Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}';
COMMENT ON COLUMN transaction_events.lamport_clock IS 'Logical timestamp scoped to this entity. Increments with each event for the entity. Used for ordering and conflict resolution.';
COMMENT ON COLUMN transaction_events.vector_clock IS 'Per-device clock values for this entity. Format: {"device-abc": 5, "device-xyz": 3}. Used in Phase B for advanced conflict detection.';
COMMENT ON COLUMN transaction_events.checksum IS 'SHA-256 hash of payload for data integrity verification.';

-- Event retention function (for future use)
CREATE OR REPLACE FUNCTION cleanup_old_events()
RETURNS void AS $$
BEGIN
  -- Keep events from last 90 days
  DELETE FROM transaction_events
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_events IS 'Remove events older than 90 days. Run periodically via cron. Phase B will implement smarter compaction strategy.';
```

**Verify**: Migration file created with complete SQL.

---

## Step 2: Apply Migration (2 min)

Apply the migration:

```bash
npx supabase db reset
```

Or to preserve data:

```bash
npx supabase migration up
```

**Verify**:

```bash
npx supabase db diff
```

Should show no diff (migration applied).

---

## Step 3: Verify Table Structure (5 min)

**Check in Supabase Dashboard**:

1. Navigate to Table Editor → transaction_events
2. Verify columns exist:
   - id (uuid, primary key)
   - entity_type (text with CHECK constraint)
   - entity_id (text)
   - op (text with CHECK constraint)
   - payload (jsonb)
   - timestamp (timestamptz)
   - actor_user_id (uuid, foreign key)
   - device_id (text, foreign key)
   - idempotency_key (text, unique)
   - event_version (int)
   - lamport_clock (bigint)
   - vector_clock (jsonb)
   - checksum (text)
   - created_at (timestamptz)

**Verify indexes** via SQL Editor:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'transaction_events'
ORDER BY indexname;
```

**Expected**:

- idx_events_entity
- idx_events_device
- idx_events_created_at
- idx_events_actor
- idx_events_lamport
- transaction_events_idempotency_key_key (UNIQUE)

---

## Step 4: Test Event Insertion (5 min)

Test inserting an event via SQL Editor:

```sql
-- Get your user ID and device ID first
SELECT auth.uid() as user_id;
SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1;

-- Insert test event
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
  'test-tx-001',
  'create',
  '{"amount_cents": 100000, "description": "Test transaction"}'::jsonb,
  auth.uid(),
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  'test-device-transaction-test-tx-001-1',
  1,
  '{"test-device": 1}'::jsonb,
  encode(sha256('test-payload'::bytea), 'hex')
);
```

**Verify**:

```sql
SELECT * FROM transaction_events WHERE entity_id = 'test-tx-001';
```

Should return the inserted event.

**Clean up**:

```sql
DELETE FROM transaction_events WHERE entity_id = 'test-tx-001';
```

---

## Step 5: Test Idempotency Key Constraint (3 min)

Try inserting duplicate:

```sql
-- Insert first event
INSERT INTO transaction_events (
  entity_type, entity_id, op, payload,
  actor_user_id, device_id, idempotency_key,
  lamport_clock, vector_clock, checksum
) VALUES (
  'transaction', 'test-dup', 'create', '{}'::jsonb,
  auth.uid(),
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  'unique-key-123',
  1, '{}'::jsonb, 'checksum1'
);

-- Try inserting with same idempotency_key
INSERT INTO transaction_events (
  entity_type, entity_id, op, payload,
  actor_user_id, device_id, idempotency_key,
  lamport_clock, vector_clock, checksum
) VALUES (
  'transaction', 'test-dup-2', 'create', '{}'::jsonb,
  auth.uid(),
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  'unique-key-123',  -- Same key!
  2, '{}'::jsonb, 'checksum2'
);
```

**Expected**: Second insert fails with `duplicate key value violates unique constraint`.

**Clean up**:

```sql
DELETE FROM transaction_events WHERE idempotency_key = 'unique-key-123';
```

---

## Step 6: Test RLS Policies (5 min)

**Test SELECT policy**:

```sql
-- As authenticated user, should see own events
SELECT COUNT(*) FROM transaction_events;
```

**Test INSERT policy**:

```sql
-- Can insert event for self
INSERT INTO transaction_events (
  entity_type, entity_id, op, payload,
  actor_user_id, device_id, idempotency_key,
  lamport_clock, vector_clock, checksum
) VALUES (
  'transaction', 'rls-test', 'create', '{}'::jsonb,
  auth.uid(),  -- Own user ID
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  'rls-test-key',
  1, '{}'::jsonb, 'checksum'
);

-- Clean up
DELETE FROM transaction_events WHERE idempotency_key = 'rls-test-key';
```

**Test UPDATE blocked**:

```sql
-- Should fail (no UPDATE policy exists)
UPDATE transaction_events
SET payload = '{}'::jsonb
WHERE entity_id = 'any-id';
```

**Expected**: RLS policy violation.

---

## Step 7: Verify CHECK Constraints (3 min)

**Test entity_type constraint**:

```sql
-- Should fail with invalid entity_type
INSERT INTO transaction_events (
  entity_type, entity_id, op, payload,
  actor_user_id, device_id, idempotency_key,
  lamport_clock, vector_clock, checksum
) VALUES (
  'invalid_type',  -- Not in allowed list
  'test', 'create', '{}'::jsonb,
  auth.uid(),
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  'check-test-1',
  1, '{}'::jsonb, 'checksum'
);
```

**Expected**: `new row violates check constraint "transaction_events_entity_type_check"`

**Test op constraint**:

```sql
-- Should fail with invalid op
INSERT INTO transaction_events (
  entity_type, entity_id, op, payload,
  actor_user_id, device_id, idempotency_key,
  lamport_clock, vector_clock, checksum
) VALUES (
  'transaction', 'test', 'invalid_op',  -- Not in allowed list
  '{}'::jsonb,
  auth.uid(),
  (SELECT id FROM devices WHERE user_id = auth.uid() LIMIT 1),
  'check-test-2',
  1, '{}'::jsonb, 'checksum'
);
```

**Expected**: `new row violates check constraint "transaction_events_op_check"`

---

## Step 8: Test Event Retention Function (2 min)

```sql
-- Call cleanup function (safe, no old events yet)
SELECT cleanup_old_events();

-- Verify function exists
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'cleanup_old_events';
```

**Expected**: Function executes without error.

---

## Done!

When the table exists, constraints work, and RLS policies are enforced, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**JSONB Storage**:

- `payload`: Flexible storage for any entity type
- `vector_clock`: Grows with number of devices (~10 bytes per device)
- Efficient querying with JSONB operators

**Foreign Key Cascades**:

- `actor_user_id` → `auth.users`: Events deleted if user deleted (rare)
- `device_id` → `devices`: Events deleted if device deleted (rare)
- Protects referential integrity

**Immutability**:

- No UPDATE or DELETE policies
- Events never change once created
- Compensating events for corrections

**Event Version**:

- Currently always 1
- Future: Bump version when event schema changes
- Allows backward-compatible event processing
