# Checkpoint: Transactions Schema

Quick verification that transactions schema and data are ready.

---

## 1. Table Schema Correct ✓

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions'
ORDER BY ordinal_position;
```

**Verify**:

- [ ] `date` is DATE type (not timestamptz)
- [ ] `amount_cents` is BIGINT
- [ ] `type` has CHECK constraint ('income' | 'expense')
- [ ] `transfer_group_id` is UUID nullable
- [ ] `tagged_user_ids` is UUID[] array
- [ ] All expected columns present

---

## 2. Test Data Seeded ✓

```sql
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE type = 'income') as income_count,
  COUNT(*) FILTER (WHERE type = 'expense') as expense_count,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
  COUNT(*) FILTER (WHERE transfer_group_id IS NOT NULL) as transfer_count
FROM transactions;
```

**Expected**:

- [ ] Total ≥ 20 transactions
- [ ] At least 1-2 income transactions
- [ ] At least 15+ expense transactions
- [ ] At least 2 pending transactions
- [ ] At least 2 transfers (1 pair)

---

## 2.5. Performance Indexes Created ✓

```sql
-- Count indexes on transactions table
SELECT COUNT(*) as index_count
FROM pg_indexes
WHERE tablename = 'transactions'
  AND indexname NOT LIKE '%pkey%';  -- Exclude primary key
```

**Expected**: 16 indexes (not including primary key)

**List all indexes:**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'transactions'
ORDER BY indexname;
```

**Verify critical indexes exist:**

- [ ] idx_transactions_account_date (compound)
- [ ] idx_transactions_category_date (compound)
- [ ] idx_transactions_date (single, DESC)
- [ ] idx_transactions_month (functional index)
- [ ] idx_transactions_tagged_users (GIN index)
- [ ] idx_transactions_transfer (partial index)

**Why this matters**: Without proper indexes, queries will be slow with >1000 transactions. These indexes support the hot queries defined in DATABASE.md lines 1071-1213.

---

## 3. RLS Policies Active ✓

```sql
SELECT
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'transactions';
```

**Expected policies**:

- [ ] "View transactions" (SELECT)
- [ ] "Create transactions" (INSERT)
- [ ] "Update transactions" (UPDATE)
- [ ] "Delete transactions" (DELETE)

---

## 3.5. Transfer Integrity Triggers Active ✓

```sql
-- Verify transfer integrity triggers
SELECT
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'transactions'
  AND trigger_name IN ('ensure_transfer_integrity', 'handle_transfer_deletion_trigger');
```

**Expected triggers:**

- [ ] ensure_transfer_integrity (BEFORE INSERT OR UPDATE)
- [ ] handle_transfer_deletion_trigger (BEFORE DELETE)

**Test transfer integrity:**

```sql
-- This should FAIL (same type in transfer)
DO $$
DECLARE
  test_transfer_id UUID := gen_random_uuid();
  test_account_1 UUID := (SELECT id FROM accounts LIMIT 1);
  test_account_2 UUID := (SELECT id FROM accounts LIMIT 1 OFFSET 1);
BEGIN
  -- Try to create invalid transfer (both expenses)
  INSERT INTO transactions (transfer_group_id, type, amount_cents, date, description, account_id)
  VALUES (test_transfer_id, 'expense', 100000, CURRENT_DATE, 'Test 1', test_account_1);

  INSERT INTO transactions (transfer_group_id, type, amount_cents, date, description, account_id)
  VALUES (test_transfer_id, 'expense', 100000, CURRENT_DATE, 'Test 2', test_account_2);

  RAISE EXCEPTION 'Test failed: Invalid transfer was allowed';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Good: Transfer integrity working - %', SQLERRM;
    ROLLBACK;
END $$;
```

**Expected**: Error message about "opposite types" - confirms trigger is working.

---

## 4. TypeScript Types Work ✓

Create test file `src/test-transactions.ts`:

```typescript
import type { Transaction, TransactionInsert } from "@/types/transactions";

const testTransaction: Transaction = {
  id: "uuid",
  household_id: "uuid",
  date: "2024-01-15",
  description: "Test",
  amount_cents: 150050,
  type: "expense",
  account_id: null,
  category_id: null,
  transfer_group_id: null,
  status: "pending",
  visibility: "household",
  created_by_user_id: "uuid",
  tagged_user_ids: [],
  notes: null,
  import_key: null,
  device_id: null,
  created_at: "2024-01-15T00:00:00Z",
  updated_at: "2024-01-15T00:00:00Z",
  currency_code: "PHP",
};

// Should type-check without errors
```

Run: `npx tsc --noEmit src/test-transactions.ts`

**Expected**: No TypeScript errors

Delete test file after verification.

---

## 5. Query Hooks Work ✓

Test in browser console:

```javascript
// Fetch all transactions
const { data } = useTransactions();
console.log("Transactions:", data);

// With filters
const { data: expenses } = useTransactions({
  type: "expense",
  exclude_transfers: true,
});
console.log("Expenses (no transfers):", expenses);

// By account
const { data: accountTransactions } = useTransactions({
  account_id: "account-uuid",
});
console.log("Account transactions:", accountTransactions);
```

**Expected**: Queries return data without errors

---

## 6. Filters Work ✓

```sql
-- Test exclude transfers filter
SELECT COUNT(*)
FROM transactions
WHERE transfer_group_id IS NULL;

-- Test date range filter
SELECT COUNT(*)
FROM transactions
WHERE date BETWEEN CURRENT_DATE - INTERVAL '30 days' AND CURRENT_DATE;

-- Test status filter
SELECT COUNT(*)
FROM transactions
WHERE status = 'pending';
```

All queries should return data.

---

## 7. Transfer Pairs Valid ✓

```sql
-- Verify transfer pairs
SELECT
  t1.description as from_desc,
  t1.type as from_type,
  t1.amount_cents as from_amount,
  t2.description as to_desc,
  t2.type as to_type,
  t2.amount_cents as to_amount,
  t1.transfer_group_id
FROM transactions t1
JOIN transactions t2 ON t1.transfer_group_id = t2.transfer_group_id AND t1.id != t2.id
WHERE t1.transfer_group_id IS NOT NULL
  AND t1.type = 'expense'; -- Show from expense side

```

**Verify**:

- [ ] Pairs have same transfer_group_id
- [ ] One is expense, other is income
- [ ] Both have same amount_cents
- [ ] Different account_ids

---

## 8. Amount Validation ✓

```sql
-- Verify all amounts are positive
SELECT COUNT(*) as negative_amounts
FROM transactions
WHERE amount_cents < 0;

-- Should be 0
```

**Expected**: 0 negative amounts

---

## 9. Date Types Correct ✓

```sql
-- Verify date is DATE, not timestamp
SELECT
  date,
  created_at,
  pg_typeof(date) as date_type,
  pg_typeof(created_at) as created_type
FROM transactions
LIMIT 1;
```

**Expected**:

- [ ] date_type = 'date'
- [ ] created_type = 'timestamp with time zone'

---

## 10. Relationships Work ✓

```sql
-- Join with accounts and categories
SELECT
  t.description,
  a.name as account_name,
  c.name as category_name
FROM transactions t
LEFT JOIN accounts a ON t.account_id = a.id
LEFT JOIN categories c ON t.category_id = c.id
LIMIT 5;
```

**Expected**: Joins work, names display correctly

---

## Success Criteria

- [ ] Transactions table exists with correct schema
- [ ] 16 performance indexes created
- [ ] 2 transfer integrity triggers active
- [ ] 20+ test transactions seeded
- [ ] RLS policies active
- [ ] TypeScript types complete
- [ ] Query hooks functional
- [ ] Filters work correctly
- [ ] Transfer pairs valid
- [ ] All amounts positive
- [ ] Date types correct
- [ ] Relationships intact

---

## Next Steps

Once verified:

1. Commit transactions schema code
2. Move to **Chunk 009: Transactions Form**

---

**Time**: 15 minutes to verify (includes index and trigger checks)
