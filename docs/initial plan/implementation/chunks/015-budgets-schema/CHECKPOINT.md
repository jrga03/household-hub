# Checkpoint: Budgets Schema

Run these verifications to ensure everything works correctly.

---

## 1. Migration Applied ✓

```bash
npx supabase db ls
```

**Expected**: Migration file shows in list with status "Applied"

```
YYYYMMDDHHMMSS_create_budgets_table.sql (Applied)
```

---

## 2. Table Structure Correct ✓

```sql
\d budgets
```

**Expected columns**:

| Column        | Type        | Nullable | Default                                |
| ------------- | ----------- | -------- | -------------------------------------- |
| id            | uuid        | NOT NULL | gen_random_uuid()                      |
| household_id  | uuid        | NOT NULL | '00000000-0000-0000-0000-000000000001' |
| category_id   | uuid        | NOT NULL | -                                      |
| month         | date        | NOT NULL | -                                      |
| month_key     | integer     | NOT NULL | GENERATED                              |
| amount_cents  | bigint      | NOT NULL | 0                                      |
| currency_code | text        | NOT NULL | 'PHP'                                  |
| created_at    | timestamptz | NOT NULL | NOW()                                  |
| updated_at    | timestamptz | NOT NULL | NOW()                                  |

**Check constraints**:

- `budgets_amount_cents_check`: amount_cents >= 0
- `budgets_currency_code_check`: currency_code = 'PHP'

**Foreign keys**:

- `category_id` → categories(id) ON DELETE CASCADE

**Unique constraint**:

- `(household_id, category_id, month)` UNIQUE

---

## 3. Indexes Created ✓

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'budgets'
ORDER BY indexname;
```

**Expected indexes**:

- `budgets_pkey` (PRIMARY KEY on id)
- `budgets_household_id_category_id_month_key` (UNIQUE)
- `idx_budgets_household`
- `idx_budgets_month`
- `idx_budgets_month_key`
- `idx_budgets_category`
- `idx_budgets_household_month`

All should be present.

---

## 4. RLS Enabled ✓

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'budgets';
```

**Expected**:

| tablename | rowsecurity |
| --------- | ----------- |
| budgets   | true        |

**Check policies**:

```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'budgets';
```

**Expected**: "Manage budgets" policy with `USING (true)` and `WITH CHECK (true)`

---

## 5. Generated Column Works ✓

```sql
INSERT INTO budgets (
  household_id,
  category_id,
  month,
  amount_cents
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM categories LIMIT 1),
  '2024-01-01',
  50000
)
RETURNING id, month, month_key;
```

**Expected**:

| id     | month      | month_key |
| ------ | ---------- | --------- |
| (uuid) | 2024-01-01 | 202401    |

**Verify**: month_key is automatically calculated as YYYYMM

---

## 6. Constraints Enforced ✓

**Test Case 1: Negative amount**

```sql
INSERT INTO budgets (
  household_id,
  category_id,
  month,
  amount_cents
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM categories LIMIT 1),
  '2024-02-01',
  -1000
);
```

**Expected**: ERROR - "violates check constraint budgets_amount_cents_check"

**Test Case 2: Duplicate budget**

```sql
-- Try to insert same category + month combination
INSERT INTO budgets (
  household_id,
  category_id,
  month,
  amount_cents
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT category_id FROM budgets LIMIT 1),
  (SELECT month FROM budgets LIMIT 1),
  60000
);
```

**Expected**: ERROR - "duplicate key value violates unique constraint"

**Test Case 3: Invalid currency**

```sql
INSERT INTO budgets (
  household_id,
  category_id,
  month,
  amount_cents,
  currency_code
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM categories LIMIT 1),
  '2024-03-01',
  70000,
  'USD'
);
```

**Expected**: ERROR - "violates check constraint budgets_currency_code_check"

---

## 7. Timestamp Trigger Works ✓

```sql
-- Insert a budget
INSERT INTO budgets (
  household_id,
  category_id,
  month,
  amount_cents
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM categories LIMIT 1),
  '2024-04-01',
  80000
)
RETURNING id, created_at, updated_at;

-- Store the ID
-- \gset budget_id

-- Wait a moment
SELECT pg_sleep(2);

-- Update the budget
UPDATE budgets
SET amount_cents = 85000
WHERE id = (SELECT id FROM budgets WHERE month = '2024-04-01' LIMIT 1)
RETURNING created_at, updated_at;
```

**Expected**:

- `created_at` stays the same
- `updated_at` changes to current time (should be ~2 seconds later)

---

## 8. Query Performance ✓

**Test month_key index**:

```sql
EXPLAIN ANALYZE
SELECT * FROM budgets
WHERE month_key = 202401;
```

**Expected**:

- Shows "Index Scan using idx_budgets_month_key"
- Execution time < 5ms (for small datasets)

**Test compound index**:

```sql
EXPLAIN ANALYZE
SELECT * FROM budgets
WHERE household_id = '00000000-0000-0000-0000-000000000001'
  AND month_key >= 202401
  AND month_key <= 202412;
```

**Expected**:

- Shows "Index Scan using idx_budgets_household_month"
- Uses Bitmap Index Scan for range query

---

## 9. Budget vs Actual Query ✓

Test the pattern for budget vs actual comparison:

```sql
WITH budget_targets AS (
  SELECT
    c.id as category_id,
    c.name as category_name,
    b.amount_cents as target
  FROM budgets b
  JOIN categories c ON c.id = b.category_id
  WHERE b.household_id = '00000000-0000-0000-0000-000000000001'
    AND b.month_key = 202401
),
actual_spending AS (
  SELECT
    category_id,
    SUM(amount_cents) as actual
  FROM transactions
  WHERE household_id = '00000000-0000-0000-0000-000000000001'
    AND DATE_TRUNC('month', date) = '2024-01-01'
    AND type = 'expense'
    AND transfer_group_id IS NULL  -- CRITICAL: Exclude transfers
  GROUP BY category_id
)
SELECT
  bt.category_name,
  bt.target,
  COALESCE(as.actual, 0) as actual,
  bt.target - COALESCE(as.actual, 0) as remaining
FROM budget_targets bt
LEFT JOIN actual_spending as ON as.category_id = bt.category_id
ORDER BY bt.category_name;
```

**Expected**:

- Query runs successfully
- Shows budget targets with actual spending
- Calculates remaining budget
- Excludes transfers from actual

---

## 10. Clean Up Test Data ✓

```sql
-- Remove test budgets
DELETE FROM budgets
WHERE household_id = '00000000-0000-0000-0000-000000000001'
  AND month >= '2024-01-01';

-- Verify cleanup
SELECT COUNT(*) FROM budgets;
```

**Expected**: Test records removed

---

## Success Criteria

- [ ] Migration applied successfully
- [ ] Table structure matches spec
- [ ] All 7 indexes created
- [ ] RLS enabled with policy
- [ ] month_key generates correctly (YYYYMM format)
- [ ] Negative amounts rejected
- [ ] Duplicate budgets rejected
- [ ] Invalid currency rejected
- [ ] Timestamp trigger works
- [ ] Indexes used in queries
- [ ] Budget vs actual query works

---

## Common Issues

### Issue: month_key not generating

**Symptom**: month_key is NULL or 0

**Solution**: Check GENERATED column syntax:

```sql
month_key INT GENERATED ALWAYS AS (
  EXTRACT(YEAR FROM month) * 100 + EXTRACT(MONTH FROM month)
) STORED
```

### Issue: RLS blocking queries

**Symptom**: SELECT returns no rows for authenticated user

**Solution**: Check RLS policy uses `USING (true)` for single household:

```sql
CREATE POLICY "Manage budgets"
  ON budgets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

### Issue: Foreign key constraint fails

**Symptom**: Cannot insert budget - "violates foreign key constraint"

**Solution**: Ensure category exists first:

```sql
-- Check categories exist
SELECT id, name FROM categories LIMIT 5;

-- Use existing category ID
INSERT INTO budgets (category_id, ...) VALUES ((SELECT id FROM categories LIMIT 1), ...);
```

---

## Next Steps

Once all checkpoints pass:

1. Commit the migration
2. Push to remote (if using remote Supabase)
3. Move to **Chunk 016: Budgets UI**

---

**Estimated Time**: 15-20 minutes to verify all checkpoints
