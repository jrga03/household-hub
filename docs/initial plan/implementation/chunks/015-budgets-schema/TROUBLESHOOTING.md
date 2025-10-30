# Troubleshooting: Budgets Schema

Common issues and solutions when creating the budgets table.

---

## Migration Issues

### Problem: Migration fails with "function update_updated_at_column() does not exist"

**Symptoms**:

```
ERROR: function update_updated_at_column() does not exist
```

**Cause**: Timestamp trigger function not created in earlier migrations

**Solution**:

Add the function to your migration before the trigger:

```sql
-- Create timestamp update function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Then create trigger
CREATE TRIGGER update_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

### Problem: Migration fails with "relation 'categories' does not exist"

**Symptoms**:

```
ERROR: relation "categories" does not exist
```

**Cause**: Categories table not created (chunk 007 skipped or incomplete)

**Solution**:

1. Check if categories exist:

   ```sql
   SELECT * FROM categories LIMIT 1;
   ```

2. If missing, run chunk 007 migrations first
3. Re-run budgets migration

---

## Generated Column Issues

### Problem: month_key shows NULL or incorrect values

**Symptoms**:

- month_key is NULL
- month_key shows 0 or wrong number

**Cause**: Generated column syntax error or month column is NULL

**Solution**:

Check the GENERATED column definition:

```sql
-- Correct syntax
month_key INT GENERATED ALWAYS AS (
  EXTRACT(YEAR FROM month) * 100 + EXTRACT(MONTH FROM month)
) STORED
```

Verify month is not NULL:

```sql
-- Check existing budgets
SELECT id, month, month_key
FROM budgets
WHERE month IS NULL;

-- Update NULL months
UPDATE budgets
SET month = '2024-01-01'
WHERE month IS NULL;
```

---

### Problem: Cannot insert month_key manually

**Symptoms**:

```
ERROR: cannot insert into column "month_key"
DETAIL: Column "month_key" is a generated column.
```

**Cause**: Trying to set month_key directly (it's GENERATED)

**Solution**:

Don't specify month_key in INSERT - it's calculated automatically:

```sql
-- ❌ Wrong:
INSERT INTO budgets (month, month_key, ...) VALUES ('2024-01-01', 202401, ...);

-- ✅ Correct:
INSERT INTO budgets (month, ...) VALUES ('2024-01-01', ...);
```

---

## Constraint Issues

### Problem: "violates check constraint budgets_amount_cents_check"

**Symptoms**:

```
ERROR: new row violates check constraint "budgets_amount_cents_check"
DETAIL: Failing row contains (..., -5000, ...).
```

**Cause**: Trying to insert negative amount

**Solution**:

Budgets must be positive. Use absolute value:

```sql
-- ❌ Wrong:
INSERT INTO budgets (amount_cents) VALUES (-5000);

-- ✅ Correct:
INSERT INTO budgets (amount_cents) VALUES (5000);
```

---

### Problem: "duplicate key value violates unique constraint"

**Symptoms**:

```
ERROR: duplicate key value violates unique constraint "budgets_household_id_category_id_month_key"
```

**Cause**: Budget already exists for this category + month combination

**Solution**:

Check for existing budget:

```sql
-- Find existing budget
SELECT *
FROM budgets
WHERE household_id = '00000000-0000-0000-0000-000000000001'
  AND category_id = (SELECT id FROM categories WHERE name = 'Groceries')
  AND month = '2024-01-01';
```

Either:

1. **Update existing**: `UPDATE budgets SET amount_cents = 60000 WHERE ...`
2. **Use different month**: `INSERT INTO budgets (month) VALUES ('2024-02-01')`
3. **Use different category**: `INSERT INTO budgets (category_id) VALUES (...)`

---

### Problem: "violates check constraint budgets_currency_code_check"

**Symptoms**:

```
ERROR: new row violates check constraint "budgets_currency_code_check"
DETAIL: Failing row contains (..., 'USD', ...).
```

**Cause**: Only PHP currency allowed for MVP

**Solution**:

Use PHP or omit currency_code (defaults to PHP):

```sql
-- ✅ Correct (explicit):
INSERT INTO budgets (currency_code) VALUES ('PHP');

-- ✅ Correct (use default):
INSERT INTO budgets (...) VALUES (...); -- currency_code defaults to 'PHP'
```

---

## RLS Policy Issues

### Problem: SELECT returns no rows despite data existing

**Symptoms**:

- As superuser: `SELECT * FROM budgets` returns rows
- As authenticated user: `SELECT * FROM budgets` returns empty

**Cause**: RLS policy too restrictive or not created

**Solution**:

Check RLS is enabled:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'budgets';
```

Check policy exists:

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'budgets';
```

Expected policy:

```sql
CREATE POLICY "Manage budgets"
  ON budgets FOR ALL
  TO authenticated
  USING (true)      -- Allow all authenticated users to read
  WITH CHECK (true); -- Allow all authenticated users to write
```

If missing, create it:

```sql
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage budgets"
  ON budgets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

---

## Index Performance Issues

### Problem: Query not using month_key index

**Symptoms**:

```sql
EXPLAIN shows "Seq Scan" instead of "Index Scan"
```

**Cause**: Query not using month_key field or index missing

**Solution**:

Use month_key for month-based queries:

```sql
-- ❌ Slow (DATE_TRUNC not indexed):
WHERE DATE_TRUNC('month', month) = '2024-01-01'

-- ✅ Fast (month_key indexed):
WHERE month_key = 202401
```

Verify index exists:

```sql
SELECT indexname
FROM pg_indexes
WHERE tablename = 'budgets'
  AND indexname = 'idx_budgets_month_key';
```

If missing, create it:

```sql
CREATE INDEX idx_budgets_month_key ON budgets(month_key);
```

---

### Problem: Query slow with household_id + month filter

**Symptoms**:

- EXPLAIN shows sequential scan
- Query takes >100ms

**Cause**: Compound index missing

**Solution**:

Create compound index:

```sql
CREATE INDEX idx_budgets_household_month
ON budgets(household_id, month_key);
```

Use it in queries:

```sql
-- This will use the compound index
SELECT *
FROM budgets
WHERE household_id = '00000000-0000-0000-0000-000000000001'
  AND month_key >= 202401
  AND month_key <= 202412;
```

---

## Data Integrity Issues

### Problem: Budgets created for non-existent categories

**Symptoms**:

- Budget has category_id that doesn't match any category
- Foreign key constraint prevents this, but want to prevent at app level

**Cause**: Category deleted after budget created, or invalid ID used

**Solution**:

The foreign key with CASCADE handles this automatically:

```sql
-- category_id UUID REFERENCES categories(id) ON DELETE CASCADE

-- When category deleted, budget is also deleted
DELETE FROM categories WHERE id = 'some-category-id';
-- All budgets for this category are automatically removed
```

To check for orphaned budgets (shouldn't exist):

```sql
SELECT b.id, b.category_id
FROM budgets b
LEFT JOIN categories c ON c.id = b.category_id
WHERE c.id IS NULL;
```

---

## Query Pattern Issues

### Problem: Budget vs actual not matching expectations

**Symptoms**:

- Actual spending much higher than expected
- Numbers don't match manual calculations

**Cause**: Forgetting to exclude transfers

**Solution**:

ALWAYS exclude transfers when calculating actual spending:

```sql
-- ❌ Wrong (includes transfers, inflates spending):
SELECT SUM(amount_cents) as actual
FROM transactions
WHERE type = 'expense'
  AND DATE_TRUNC('month', date) = '2024-01-01';

-- ✅ Correct (excludes transfers):
SELECT SUM(amount_cents) as actual
FROM transactions
WHERE type = 'expense'
  AND DATE_TRUNC('month', date) = '2024-01-01'
  AND transfer_group_id IS NULL;  -- CRITICAL
```

**Why**: Transfers move money between accounts but aren't actual expenses.

---

## Migration Rollback

### Problem: Need to undo budgets table creation

**Symptoms**:

- Want to rollback migration
- Need to fix schema and re-run

**Solution**:

Create rollback migration:

```bash
npx supabase migration new rollback_budgets_table
```

Add rollback SQL:

```sql
-- Drop indexes
DROP INDEX IF EXISTS idx_budgets_household_month;
DROP INDEX IF EXISTS idx_budgets_category;
DROP INDEX IF EXISTS idx_budgets_month_key;
DROP INDEX IF EXISTS idx_budgets_month;
DROP INDEX IF EXISTS idx_budgets_household;

-- Drop policies
DROP POLICY IF EXISTS "Manage budgets" ON budgets;

-- Disable RLS
ALTER TABLE budgets DISABLE ROW LEVEL SECURITY;

-- Drop trigger
DROP TRIGGER IF EXISTS update_budgets_updated_at ON budgets;

-- Drop table
DROP TABLE IF EXISTS budgets CASCADE;
```

Then run:

```bash
npx supabase db reset
```

---

## Prevention Tips

1. **Always check constraints**: Test negative amounts, duplicates, invalid currency before deploying
2. **Verify indexes**: Use EXPLAIN ANALYZE to confirm indexes are used
3. **Test RLS policies**: Connect as authenticated user to test access
4. **Document month_key usage**: Remind developers to use month_key for performance
5. **Exclude transfers**: Add comment in queries to remember transfer exclusion
6. **Validate foreign keys**: Ensure categories exist before creating budgets

---

## Getting Help

If you're stuck:

1. Check this troubleshooting guide first
2. Review `docs/initial plan/DATABASE.md` lines 265-294
3. Check `docs/initial plan/DECISIONS.md` #80 (budget philosophy)
4. Run `EXPLAIN ANALYZE` on slow queries
5. Check RLS policies with `\dp budgets` in psql
6. Verify constraints with `\d budgets` in psql

---

## Quick Fixes

```bash
# Reset local database
npx supabase db reset

# Check migration status
npx supabase migration list

# View table structure
npx supabase db ls

# Test query performance
npx supabase db shell
# Then run EXPLAIN ANALYZE ...
```

---

**Remember**: Budgets are reference targets only. Always calculate actual spending from transactions, excluding transfers.
