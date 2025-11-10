# D1 Verification: Database Schema & Migrations

## Quick Verification (5 minutes)

Run these queries in Supabase SQL Editor to confirm success:

```sql
-- 1. Check tables exist
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('debts', 'internal_debts', 'debt_payments');
-- Expected: 3

-- 2. Check no balance field exists (CRITICAL)
SELECT COUNT(*) FROM information_schema.columns
WHERE table_name IN ('debts', 'internal_debts')
  AND column_name = 'current_balance_cents';
-- Expected: 0 (must be zero!)

-- 3. Check RLS enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('debts', 'internal_debts', 'debt_payments');
-- Expected: All rows show rowsecurity = true

-- 4. Check triggers exist
SELECT COUNT(*) FROM pg_trigger
WHERE tgname IN (
  'prevent_self_borrow',
  'validate_payment_overpayment',
  'enforce_debt_limit',
  'enforce_payment_limit',
  'update_debt_on_payment'
);
-- Expected: 5
```

**If all checks pass**, proceed to detailed verification below.

---

## Part 1: Table Structure Verification

### 1.1 Debts Table Schema

```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'debts'
ORDER BY ordinal_position;
```

**Expected columns**:

- `id` (uuid, NOT NULL, default gen_random_uuid())
- `household_id` (uuid, NOT NULL)
- `name` (text, NOT NULL)
- `original_amount_cents` (bigint, NOT NULL)
- `status` (text, NOT NULL, default 'active')
- `created_at` (timestamptz, default NOW())
- `updated_at` (timestamptz, default NOW())
- `closed_at` (timestamptz, nullable)

**Critical**: Verify `current_balance_cents` is **NOT** in the list.

### 1.2 Internal Debts Table Schema

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'internal_debts'
ORDER BY ordinal_position;
```

**Expected additional columns** (beyond debts structure):

- `from_type` (text, NOT NULL)
- `from_id` (uuid, NOT NULL)
- `from_display_name` (text, NOT NULL)
- `to_type` (text, NOT NULL)
- `to_id` (uuid, NOT NULL)
- `to_display_name` (text, NOT NULL)

**Critical**: Verify no FK constraints on `from_id` and `to_id`:

```sql
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'internal_debts'
  AND kcu.column_name IN ('from_id', 'to_id');
```

**Expected**: 0 rows (no FK constraints - soft references pattern)

### 1.3 Debt Payments Table Schema

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'debt_payments'
ORDER BY ordinal_position;
```

**Expected columns**:

- `id`, `household_id`
- `debt_id` (nullable), `internal_debt_id` (nullable)
- `transaction_id` (NOT NULL, has FK)
- `amount_cents` (bigint, NOT NULL)
- `payment_date` (date, NOT NULL)
- `device_id` (text, NOT NULL)
- `is_reversal` (boolean, default false)
- `reverses_payment_id` (nullable, has FK)
- `adjustment_reason` (text, nullable)
- `is_overpayment` (boolean, default false)
- `overpayment_amount` (bigint, nullable)
- `created_at` (timestamptz)

**Verify transaction_id FK has NO CASCADE**:

```sql
SELECT
  rc.delete_rule
FROM information_schema.referential_constraints rc
JOIN information_schema.table_constraints tc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'debt_payments'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND EXISTS (
    SELECT 1 FROM information_schema.key_column_usage kcu
    WHERE kcu.constraint_name = tc.constraint_name
      AND kcu.column_name = 'transaction_id'
  );
```

**Expected**: `delete_rule = 'NO ACTION'` or `'RESTRICT'` (NOT CASCADE)

---

## Part 2: Constraint Verification

### 2.1 CHECK Constraints

```sql
SELECT
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname IN ('debts', 'internal_debts', 'debt_payments')
  AND con.contype = 'c'
ORDER BY rel.relname, con.conname;
```

**Expected constraints**:

**debts**:

- `original_amount_cents > 0`
- `status IN ('active', 'paid_off', 'archived')`

**internal_debts**:

- `original_amount_cents > 0`
- `status IN ('active', 'paid_off', 'archived')`
- `from_type IN ('category', 'account', 'member')`
- `to_type IN ('category', 'account', 'member')`

**debt_payments**:

- `amount_cents != 0`
- `one_debt_type` (debt_id XOR internal_debt_id)
- `reversal_amount_negative` (reversals must be negative)
- `overpayment_fields_linked` (both or neither)

### 2.2 Unique Constraints

Test name uniqueness for active debts:

```sql
-- Should succeed: Different names
INSERT INTO debts (household_id, name, original_amount_cents)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Debt 1', 100000);

INSERT INTO debts (household_id, name, original_amount_cents)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Debt 2', 200000);

-- Should fail: Duplicate active name
INSERT INTO debts (household_id, name, original_amount_cents)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Debt 1', 300000);
-- Expected error: duplicate key value violates unique constraint

-- Cleanup
DELETE FROM debts WHERE name LIKE 'Test Debt%';
```

---

## Part 3: Trigger Testing

### 3.1 Self-Borrowing Prevention Trigger

```sql
-- Should fail: Same entity borrowing from itself
INSERT INTO internal_debts (
  household_id, name, original_amount_cents,
  from_type, from_id, from_display_name,
  to_type, to_id, to_display_name
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Invalid Self Borrow',
  50000,
  'category', '12345678-1234-1234-1234-123456789012', 'Groceries',
  'category', '12345678-1234-1234-1234-123456789012', 'Groceries'
);
-- Expected error: Cannot create internal debt where source and destination are the same entity
```

### 3.2 Overpayment Validation Trigger

Set up test debt and payment:

```sql
-- Create test debt
INSERT INTO debts (id, household_id, name, original_amount_cents)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  'Overpayment Test',
  10000  -- ₱100.00
);

-- Create test transaction (needed for FK)
INSERT INTO transactions (
  id, household_id, amount_cents, type, date, account_id
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000001',
  15000,
  'expense',
  CURRENT_DATE,
  (SELECT id FROM accounts LIMIT 1)  -- Use any existing account
);

-- Create overpayment (₱150 payment on ₱100 debt)
INSERT INTO debt_payments (
  debt_id, transaction_id, amount_cents, payment_date, device_id
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  15000,  -- ₱150.00 (exceeds ₱100 debt)
  CURRENT_DATE,
  'test-device'
);

-- Verify trigger set overpayment flags
SELECT
  is_overpayment,
  overpayment_amount,
  amount_cents
FROM debt_payments
WHERE transaction_id = '22222222-2222-2222-2222-222222222222';
-- Expected:
-- is_overpayment = true
-- overpayment_amount = 5000 (₱50.00 over)
-- amount_cents = 15000

-- Cleanup
DELETE FROM debt_payments WHERE debt_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM transactions WHERE id = '22222222-2222-2222-2222-222222222222';
DELETE FROM debts WHERE id = '11111111-1111-1111-1111-111111111111';
```

### 3.3 Rate Limiting Triggers

Test debt count limit:

```sql
-- Insert 100 debts (should succeed)
DO $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..100 LOOP
    INSERT INTO debts (household_id, name, original_amount_cents)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'Debt ' || i,
      10000
    );
  END LOOP;
END $$;

-- Insert 101st debt (should fail)
INSERT INTO debts (household_id, name, original_amount_cents)
VALUES ('00000000-0000-0000-0000-000000000001', 'Debt 101', 10000);
-- Expected error: Maximum debt limit (100) reached for household

-- Cleanup
DELETE FROM debts WHERE name LIKE 'Debt %';
```

Test payment count limit (similar pattern - 100 max per debt).

### 3.4 Timestamp Sync Trigger

```sql
-- Create debt with initial timestamp
INSERT INTO debts (id, household_id, name, original_amount_cents)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '00000000-0000-0000-0000-000000000001',
  'Timestamp Test',
  10000
);

-- Record original timestamp
SELECT updated_at FROM debts
WHERE id = '33333333-3333-3333-3333-333333333333';
-- Note this timestamp

-- Wait 1 second, then add payment
SELECT pg_sleep(1);

INSERT INTO transactions (
  id, household_id, amount_cents, type, date, account_id
) VALUES (
  '44444444-4444-4444-4444-444444444444',
  '00000000-0000-0000-0000-000000000001',
  5000, 'expense', CURRENT_DATE,
  (SELECT id FROM accounts LIMIT 1)
);

INSERT INTO debt_payments (
  debt_id, transaction_id, amount_cents, payment_date, device_id
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  5000, CURRENT_DATE, 'test-device'
);

-- Verify debt updated_at changed
SELECT updated_at FROM debts
WHERE id = '33333333-3333-3333-3333-333333333333';
-- Expected: Timestamp newer than original

-- Cleanup
DELETE FROM debt_payments WHERE debt_id = '33333333-3333-3333-3333-333333333333';
DELETE FROM transactions WHERE id = '44444444-4444-4444-4444-444444444444';
DELETE FROM debts WHERE id = '33333333-3333-3333-3333-333333333333';
```

---

## Part 4: Index Verification

```sql
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('debts', 'internal_debts', 'debt_payments')
ORDER BY tablename, indexname;
```

**Expected indexes** (13 total):

**debts** (2):

- `idx_debts_household_name_unique` (partial - WHERE status = 'active')
- `idx_debts_household_status`

**internal_debts** (4):

- `idx_internal_debts_household_name_unique` (partial)
- `idx_internal_debts_household_status`
- `idx_internal_debts_from`
- `idx_internal_debts_to`

**debt_payments** (6):

- `idx_debt_payments_debt_id_date` (partial - WHERE debt_id IS NOT NULL)
- `idx_debt_payments_internal_debt_id_date` (partial)
- `idx_debt_payments_transaction_id`
- `idx_debt_payments_reverses` (partial - WHERE reverses_payment_id IS NOT NULL)
- `idx_debt_payments_device`

**transactions** (2 new):

- `idx_transactions_debt_id` (partial)
- `idx_transactions_internal_debt_id` (partial)

---

## Part 5: RLS Policy Testing

### 5.1 Test as Authenticated User

```sql
-- Set user context (replace with actual user ID)
SET request.jwt.claim.sub = 'user-uuid-here';

-- Should see only household debts
SELECT COUNT(*) FROM debts;
-- Should work without error

-- Try to insert debt for different household (should fail)
INSERT INTO debts (household_id, name, original_amount_cents)
VALUES ('99999999-9999-9999-9999-999999999999', 'Unauthorized', 10000);
-- Expected: Policy violation or 0 rows inserted
```

### 5.2 Verify Helper Function

```sql
SELECT get_user_household_id();
-- Should return a UUID (household_id for auth.uid())
```

---

## Part 6: Transaction Integration

### 6.1 Verify Columns Added

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN ('debt_id', 'internal_debt_id');
```

**Expected**: 2 rows (both columns exist)

### 6.2 Test Transaction-Debt Linkage

```sql
-- Create transaction with debt link
INSERT INTO transactions (
  household_id, amount_cents, type, date,
  account_id, debt_id
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  5000, 'expense', CURRENT_DATE,
  (SELECT id FROM accounts LIMIT 1),
  (SELECT id FROM debts LIMIT 1)
);
-- Should succeed

-- Query transaction with debt
SELECT
  t.amount_cents,
  d.name AS debt_name
FROM transactions t
LEFT JOIN debts d ON d.id = t.debt_id
WHERE t.debt_id IS NOT NULL
LIMIT 1;
-- Should return row with debt name

-- Cleanup
DELETE FROM transactions WHERE debt_id IS NOT NULL;
```

---

## Part 7: Events Table Integration

```sql
-- Verify CHECK constraint updated
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'events_entity_type_check'
  AND conrelid = 'events'::regclass;
-- Should include: 'debt', 'internal_debt', 'debt_payment'
```

---

## Part 8: Lamport Clock RPC Function

```sql
-- Test RPC function
SELECT get_max_lamport_clock('test-device-123');
-- Expected: Returns 0 (no events for this device yet)

-- Insert test event
INSERT INTO events (
  entity_type, entity_id, op, payload,
  idempotency_key, lamport_clock, vector_clock,
  device_id, actor_user_id, household_id
) VALUES (
  'debt', gen_random_uuid(), 'create', '{}'::jsonb,
  'test-key', 42, '{}'::jsonb,
  'test-device-123',
  (SELECT id FROM profiles LIMIT 1),
  '00000000-0000-0000-0000-000000000001'
);

-- Query again
SELECT get_max_lamport_clock('test-device-123');
-- Expected: Returns 42

-- Cleanup
DELETE FROM events WHERE device_id = 'test-device-123';
```

---

## Troubleshooting

### Issue: Migration fails with "table already exists"

**Cause**: Running migration multiple times

**Solution**: Migration uses `CREATE TABLE IF NOT EXISTS` - should be idempotent. If error persists:

```sql
DROP TABLE IF EXISTS debt_payments CASCADE;
DROP TABLE IF EXISTS internal_debts CASCADE;
DROP TABLE IF EXISTS debts CASCADE;
-- Then re-run migration
```

### Issue: Trigger function fails with "column does not exist"

**Cause**: Events table missing required columns

**Solution**: Verify events table has `lamport_clock`, `vector_clock`, `device_id` fields from prior migrations.

### Issue: RLS test fails with "permission denied"

**Cause**: User not authenticated or no profile

**Solution**:

1. Verify user exists in `auth.users`
2. Verify profile exists in `profiles` table
3. Check `get_user_household_id()` returns valid UUID

### Issue: Overpayment trigger not setting flags

**Cause**: Balance calculation incorrect

**Debug**:

```sql
-- Manually calculate balance
SELECT
  d.original_amount_cents,
  COALESCE(SUM(dp.amount_cents), 0) AS total_paid,
  d.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0) AS balance
FROM debts d
LEFT JOIN debt_payments dp ON dp.debt_id = d.id
  AND dp.is_reversal = false
  AND NOT EXISTS (
    SELECT 1 FROM debt_payments rev
    WHERE rev.reverses_payment_id = dp.id
  )
WHERE d.id = 'your-debt-id'
GROUP BY d.id, d.original_amount_cents;
```

### Issue: Self-borrowing trigger allows same entity

**Cause**: Comparing different types or NULL values

**Debug**:

```sql
-- Check trigger function
SELECT prosrc FROM pg_proc WHERE proname = 'check_internal_debt_self_borrow';
-- Verify: NEW.from_type = NEW.to_type AND NEW.from_id = NEW.to_id
```

---

## Final Checklist

Before moving to Chunk D2:

- [ ] All 3 tables created
- [ ] All 5 triggers working correctly
- [ ] All 13 indexes exist
- [ ] RLS policies active and tested
- [ ] Transaction integration working
- [ ] Events table accepts debt types
- [ ] Helper function returns household_id
- [ ] RPC function syncs lamport clock
- [ ] No `current_balance_cents` field exists anywhere
- [ ] All verification queries pass
- [ ] No console errors or warnings
- [ ] Can insert/query debts successfully
- [ ] Trigger validations block invalid data
- [ ] Rate limits enforced (100 debts, 100 payments)

---

## Performance Verification (Optional)

Test query performance with indexes:

```sql
-- Test payment history query
EXPLAIN ANALYZE
SELECT *
FROM debt_payments
WHERE debt_id = 'test-id'
ORDER BY payment_date DESC, created_at DESC
LIMIT 10;
-- Should show Index Scan on idx_debt_payments_debt_id_date

-- Test debt listing query
EXPLAIN ANALYZE
SELECT *
FROM debts
WHERE household_id = '00000000-0000-0000-0000-000000000001'
  AND status = 'active'
ORDER BY updated_at DESC;
-- Should show Index Scan on idx_debts_household_status
```

---

**Status**: ✅ Chunk D1 Complete

**Next Chunk**: D2 - Dexie Schema & Offline Setup
