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

**Time**: 10 minutes to verify
