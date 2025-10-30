# Instructions: Budgets Schema

Follow these steps in order. Estimated time: 35 minutes.

---

## Step 0: Prerequisites Verification (5 min)

Before creating the budgets schema, verify all dependencies are in place.

### Check 1: Categories Table Exists

Chunk 007 (categories setup) must be completed:

```sql
-- Verify categories table exists
SELECT COUNT(*) as category_count FROM categories;

-- Expected output: At least 1 category exists
-- If 0: Complete chunk 007 first
```

**Verify**: Categories table accessible with data

---

### Check 2: Supabase CLI Installed

```bash
npx supabase --version
```

**Expected output**: `supabase version 1.x.x` or higher

**If missing**: Install Supabase CLI:

```bash
npm install supabase --save-dev
```

---

### Check 3: Database Connection Working

```bash
npx supabase db ls
```

**Expected output**: List of existing migrations

**If fails**:

- Check `.env` file has correct `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- Run `npx supabase link` if using remote project
- Run `npx supabase start` if using local development

---

### Check 4: Previous Migrations Applied

```bash
npx supabase migration list
```

**Expected**: Shows migrations including categories setup

**Sample output**:

```
✓ 20240101000000_initial_schema.sql (Applied)
✓ 20240102000000_create_categories.sql (Applied)
```

**If missing**: Run migrations first:

```bash
npx supabase db reset
# or
npx supabase db push
```

---

### Check 5: Timestamp Trigger Function Exists

The `update_updated_at_column()` function should exist from earlier migrations:

```sql
-- Check if timestamp trigger function exists
SELECT EXISTS (
  SELECT 1 FROM pg_proc
  WHERE proname = 'update_updated_at_column'
) as function_exists;

-- Expected: function_exists = true
```

**If false**: See Step 4 in instructions for function creation SQL

---

**All checks passed?** → Proceed to Step 1

**Any check failed?** → Resolve issues before continuing

---

## Step 1: Create Migration File (5 min)

Create a new migration:

```bash
cd /path/to/household-hub
npx supabase migration new create_budgets_table
```

This creates a file like `supabase/migrations/YYYYMMDDHHMMSS_create_budgets_table.sql`.

**Verify**: File created in `supabase/migrations/`

---

## Step 2: Define Budgets Table (10 min)

Open the migration file and add:

```sql
-- Create budgets table for monthly spending targets
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,

  -- Month tracking
  month DATE NOT NULL, -- First day of month (e.g., '2024-01-01')
  month_key INT GENERATED ALWAYS AS (
    EXTRACT(YEAR FROM month) * 100 + EXTRACT(MONTH FROM month)
  ) STORED, -- YYYYMM format for fast queries (e.g., 202401)

  -- Budget amount
  amount_cents BIGINT DEFAULT 0 CHECK (amount_cents >= 0) NOT NULL,
  currency_code TEXT DEFAULT 'PHP' CHECK (currency_code = 'PHP') NOT NULL,

  -- Note: Budgets are spending targets only (Decision #80)
  -- No balance rollover - actual spending always calculated from transactions
  -- Month boundaries use profiles.timezone for display
  -- Can copy previous month's targets as starting point

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Constraints
  UNIQUE(household_id, category_id, month)
);

-- Create indexes for common queries
CREATE INDEX idx_budgets_household ON budgets(household_id);
CREATE INDEX idx_budgets_month ON budgets(month);
CREATE INDEX idx_budgets_month_key ON budgets(month_key);
CREATE INDEX idx_budgets_category ON budgets(category_id);
CREATE INDEX idx_budgets_household_month ON budgets(household_id, month_key);
```

**Verify**: SQL syntax is valid

---

## Step 3: Add RLS Policies (5 min)

Add to the same migration file:

```sql
-- Enable Row Level Security
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view and manage budgets
-- (Single household for MVP, so all users share budgets)
CREATE POLICY "Manage budgets"
  ON budgets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

**Why `USING (true)`**: In MVP with single household, all authenticated users share budgets. Multi-household support will add filtering later.

---

## Step 4: Add Timestamp Trigger (5 min)

Add trigger for automatic `updated_at`:

```sql
-- Apply automatic updated_at trigger
CREATE TRIGGER update_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Note**: The `update_updated_at_column()` function should already exist from earlier migrations. If not, add:

```sql
-- Create timestamp update function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Step 5: Run Migration (3 min)

Apply the migration:

```bash
# Apply to local Supabase
npx supabase db reset

# Or push to remote
npx supabase db push
```

**Expected output**:

```
Applying migration YYYYMMDDHHMMSS_create_budgets_table.sql...
Success. Database migrated.
```

---

## Step 6: Verify Table Structure (2 min)

Check the table was created:

```bash
npx supabase db ls
```

Or via SQL:

```sql
-- Check table exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'budgets'
ORDER BY ordinal_position;

-- Expected columns:
-- id (uuid)
-- household_id (uuid)
-- category_id (uuid)
-- month (date)
-- month_key (integer) - generated
-- amount_cents (bigint)
-- currency_code (text)
-- created_at (timestamptz)
-- updated_at (timestamptz)
```

**Verify**: All columns present with correct types

---

## Step 7: Test Constraints (5 min)

Test the table constraints work:

```sql
-- Test 1: Create valid budget
INSERT INTO budgets (
  household_id,
  category_id,
  month,
  amount_cents
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM categories LIMIT 1), -- Use existing category
  '2024-01-01',
  50000 -- ₱500.00
);

-- Expected: Success
-- Check month_key generated:
SELECT id, month, month_key, amount_cents FROM budgets;
-- Should show: month_key = 202401

-- Test 2: Try negative amount (should fail)
INSERT INTO budgets (
  household_id,
  category_id,
  month,
  amount_cents
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM categories LIMIT 1),
  '2024-02-01',
  -1000 -- Invalid: negative
);

-- Expected: ERROR: new row violates check constraint "budgets_amount_cents_check"

-- Test 3: Try duplicate (should fail)
INSERT INTO budgets (
  household_id,
  category_id,
  month,
  amount_cents
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM categories WHERE id = (SELECT category_id FROM budgets LIMIT 1)),
  '2024-01-01', -- Same month
  60000
);

-- Expected: ERROR: duplicate key value violates unique constraint

-- Test 4: Try invalid currency (should fail)
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
  'USD' -- Invalid: only PHP allowed
);

-- Expected: ERROR: new row violates check constraint "budgets_currency_code_check"
```

All constraint tests should behave as expected.

---

## Step 8: Test Indexes (5 min)

Verify indexes are being used:

```sql
-- Test month_key index
EXPLAIN ANALYZE
SELECT * FROM budgets
WHERE month_key = 202401;

-- Should show: "Index Scan using idx_budgets_month_key"

-- Test compound index
EXPLAIN ANALYZE
SELECT * FROM budgets
WHERE household_id = '00000000-0000-0000-0000-000000000001'
  AND month_key = 202401;

-- Should show: "Index Scan using idx_budgets_household_month"

-- Test RLS policy
SET ROLE authenticated;
SELECT * FROM budgets;
-- Should return rows (RLS policy allows authenticated users)

RESET ROLE;
```

**Verify**: Indexes are being used (check EXPLAIN output)

---

## Done!

When all tests pass, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Month Key Benefits**:

- Integer comparison is ~10x faster than DATE_TRUNC
- Allows efficient month-based queries
- Automatically maintained via GENERATED column

**Why Date-First Pattern**:

- Store as DATE ('2024-01-01'), not integer (202401)
- DATE type is more intuitive and prevents bugs
- month_key generated automatically for performance

**Budget Philosophy**:

- Targets, not balances (no rollover between months)
- Actual spending calculated from transactions
- Transfers excluded from budget calculations
- Simple, predictable behavior
