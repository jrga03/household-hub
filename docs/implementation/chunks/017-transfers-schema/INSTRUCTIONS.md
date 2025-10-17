# Instructions: Transfers Schema

Follow these steps in order. Estimated time: 45 minutes.

---

## Step 1: Create Transfer Triggers Migration (10 min)

```bash
npx supabase migration new add_transfer_triggers
```

Add to migration file:

```sql
-- Transfer Integrity: Ensure exactly 2 transactions with opposite types

CREATE OR REPLACE FUNCTION check_transfer_integrity()
RETURNS TRIGGER AS $$
DECLARE
  transfer_count INT;
  opposite_type TEXT;
  total_amount BIGINT;
BEGIN
  -- Only check if this is part of a transfer
  IF NEW.transfer_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count existing transactions in this transfer group
  SELECT COUNT(*), SUM(amount_cents)
  INTO transfer_count, total_amount
  FROM transactions
  WHERE transfer_group_id = NEW.transfer_group_id
  AND id != NEW.id;

  -- Ensure maximum 2 transactions per transfer group
  IF transfer_count >= 2 THEN
    RAISE EXCEPTION 'Transfer group can only have 2 transactions';
  END IF;

  -- If this is the second transaction, verify opposite types and amounts
  IF transfer_count = 1 THEN
    -- Get the type of the other transaction
    SELECT type INTO opposite_type
    FROM transactions
    WHERE transfer_group_id = NEW.transfer_group_id
    AND id != NEW.id;

    -- Ensure opposite types (one income, one expense)
    IF NEW.type = opposite_type THEN
      RAISE EXCEPTION 'Transfer must have opposite types (income/expense)';
    END IF;

    -- Ensure same amount
    IF NEW.amount_cents != total_amount THEN
      RAISE EXCEPTION 'Transfer transactions must have same amount';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Handle transfer deletion: nullify transfer_group_id on paired transaction
CREATE OR REPLACE FUNCTION handle_transfer_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- If deleting a transfer transaction, nullify the pair's transfer_group_id
  IF OLD.transfer_group_id IS NOT NULL THEN
    UPDATE transactions
    SET transfer_group_id = NULL
    WHERE transfer_group_id = OLD.transfer_group_id
      AND id != OLD.id;

    RAISE NOTICE 'Transfer deleted: transfer_group_id % orphaned, paired transaction % unmarked',
      OLD.transfer_group_id,
      (SELECT id FROM transactions WHERE transfer_group_id = OLD.transfer_group_id AND id != OLD.id);
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to transactions table
CREATE TRIGGER ensure_transfer_integrity
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION check_transfer_integrity();

CREATE TRIGGER handle_transfer_deletion_trigger
BEFORE DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION handle_transfer_deletion();

-- Note: When a transfer transaction is deleted, the paired transaction is converted
-- to a regular transaction (transfer_group_id set to NULL). The user can then
-- re-categorize it or delete it separately. See Decision #60 for transfer design.
```

---

## Step 2: Run Migration (5 min)

```bash
npx supabase db reset
```

**Expected**: Migration applies successfully

---

## Step 3: Test Transfer Integrity (15 min)

**Test 1: Valid Transfer**

```sql
-- Create transfer group ID
SELECT gen_random_uuid() AS transfer_id \gset

-- Create expense (from account)
INSERT INTO transactions (
  household_id,
  account_id,
  date,
  description,
  amount_cents,
  type,
  transfer_group_id,
  created_by_user_id,
  device_id
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM accounts LIMIT 1),
  CURRENT_DATE,
  'Transfer to Savings',
  50000,
  'expense',
  :'transfer_id',
  (SELECT id FROM profiles LIMIT 1),
  'test-device'
);

-- Create income (to account)
INSERT INTO transactions (
  household_id,
  account_id,
  date,
  description,
  amount_cents,
  type,
  transfer_group_id,
  created_by_user_id,
  device_id
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM accounts LIMIT 1 OFFSET 1),
  CURRENT_DATE,
  'Transfer from Checking',
  50000,
  'income',
  :'transfer_id',
  (SELECT id FROM profiles LIMIT 1),
  'test-device'
);

-- Expected: Both inserts succeed
```

**Test 2: Same Type (Should Fail)**

```sql
SELECT gen_random_uuid() AS transfer_id2 \gset

-- First expense
INSERT INTO transactions (..., type, transfer_group_id)
VALUES (..., 'expense', :'transfer_id2');

-- Second expense (should fail)
INSERT INTO transactions (..., type, transfer_group_id)
VALUES (..., 'expense', :'transfer_id2');

-- Expected: ERROR - "Transfer must have opposite types"
```

**Test 3: Different Amounts (Should Fail)**

```sql
SELECT gen_random_uuid() AS transfer_id3 \gset

INSERT INTO transactions (..., amount_cents, type, transfer_group_id)
VALUES (..., 50000, 'expense', :'transfer_id3');

INSERT INTO transactions (..., amount_cents, type, transfer_group_id)
VALUES (..., 60000, 'income', :'transfer_id3');

-- Expected: ERROR - "Transfer transactions must have same amount"
```

**Test 4: Three Transactions (Should Fail)**

```sql
SELECT gen_random_uuid() AS transfer_id4 \gset

-- First two succeed
INSERT INTO transactions (...) VALUES (...);
INSERT INTO transactions (...) VALUES (...);

-- Third should fail
INSERT INTO transactions (..., transfer_group_id)
VALUES (..., :'transfer_id4');

-- Expected: ERROR - "Transfer group can only have 2 transactions"
```

---

## Step 4: Test Transfer Deletion (10 min)

```sql
-- Create valid transfer
SELECT gen_random_uuid() AS transfer_id5 \gset

INSERT INTO transactions (id, ..., transfer_group_id)
VALUES (gen_random_uuid(), ..., :'transfer_id5')
RETURNING id AS tx1_id \gset

INSERT INTO transactions (id, ..., transfer_group_id)
VALUES (gen_random_uuid(), ..., :'transfer_id5')
RETURNING id AS tx2_id \gset

-- Verify both have transfer_group_id
SELECT id, transfer_group_id
FROM transactions
WHERE id IN (:'tx1_id', :'tx2_id');

-- Delete one transaction
DELETE FROM transactions WHERE id = :'tx1_id';

-- Check the paired transaction
SELECT id, transfer_group_id
FROM transactions
WHERE id = :'tx2_id';

-- Expected: transfer_group_id is now NULL
```

---

## Step 5: Document Transfer Exclusion Pattern (5 min)

Add comprehensive documentation to migration:

```sql
-- ============================================================================
-- CRITICAL: Transfer Exclusion Pattern for Analytics and Budgets
-- ============================================================================
--
-- Transfers represent money movement between accounts, NOT actual income/expenses.
-- Including them in analytics would double-count the money movement.
--
-- RULE OF THUMB:
-- - Analytics & Budgets: EXCLUDE transfers (WHERE transfer_group_id IS NULL)
-- - Account Balances: INCLUDE transfers (they affect balances)
-- - Transfer Reports: FILTER to transfers (WHERE transfer_group_id IS NOT NULL)
--
-- EXAMPLE 1: Monthly spending (CORRECT - excludes transfers)
-- SELECT SUM(amount_cents) FROM transactions
-- WHERE type = 'expense'
--   AND transfer_group_id IS NULL  -- EXCLUDE TRANSFERS
--   AND DATE_TRUNC('month', date) = '2024-01-01';
--
-- EXAMPLE 2: Budget vs actual (CORRECT - excludes transfers)
-- SELECT
--   b.category_id,
--   b.amount_cents as target,
--   COALESCE(SUM(t.amount_cents), 0) as actual
-- FROM budgets b
-- LEFT JOIN transactions t
--   ON t.category_id = b.category_id
--   AND t.transfer_group_id IS NULL  -- CRITICAL: EXCLUDE TRANSFERS
--   AND DATE_TRUNC('month', t.date) = b.month
--   AND t.type = 'expense'
-- WHERE b.month = '2024-01-01'
-- GROUP BY b.category_id, b.amount_cents;
--
-- EXAMPLE 3: Account balance (CORRECT - includes transfers)
-- SELECT
--   a.id,
--   a.name,
--   a.initial_balance_cents +
--   COALESCE(SUM(CASE
--     WHEN t.type = 'income' THEN t.amount_cents
--     WHEN t.type = 'expense' THEN -t.amount_cents
--   END), 0) as balance_cents
-- FROM accounts a
-- LEFT JOIN transactions t ON t.account_id = a.id
-- -- NOTE: Do NOT exclude transfers here - they affect account balances
-- WHERE a.id = 'some-account-id'
-- GROUP BY a.id, a.name, a.initial_balance_cents;
--
-- EXAMPLE 4: Transfer report (shows only transfers)
-- SELECT
--   t1.date,
--   t1.description,
--   t1.amount_cents,
--   a1.name as from_account,
--   a2.name as to_account
-- FROM transactions t1
-- JOIN transactions t2
--   ON t1.transfer_group_id = t2.transfer_group_id
--   AND t1.id != t2.id
-- LEFT JOIN accounts a1 ON t1.account_id = a1.id
-- LEFT JOIN accounts a2 ON t2.account_id = a2.id
-- WHERE t1.type = 'expense'  -- Show from expense side
--   AND t1.transfer_group_id IS NOT NULL
-- ORDER BY t1.date DESC;
--
-- See DATABASE.md lines 476-543 for complete details.
-- ============================================================================
```

---

## Done!

**Next**: Run through `CHECKPOINT.md` to verify all constraints work.
