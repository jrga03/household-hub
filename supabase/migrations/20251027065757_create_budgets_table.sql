-- =====================================================
-- Migration: Create Budgets Table
-- =====================================================
-- Purpose: Create budgets table for monthly spending targets (reference values only, no balance rollover)
-- References: DATABASE.md lines 265-294, Decision #80 (budgets are reference targets), Decision #79
-- Safety: This migration creates a new table. Recommend snapshot before running.
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Create Budgets Table
-- =====================================================

CREATE TABLE budgets (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Household isolation (multi-household architecture ready)
  household_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Budget definition
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- First day of month (e.g., '2024-01-01') - stored in UTC, displayed in user's timezone
  month_key INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM month) * 100 + EXTRACT(MONTH FROM month)) STORED, -- YYYYMM format for fast queries (e.g., 202401)

  -- Budget amount
  amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (amount_cents >= 0), -- Target spending amount in cents
  currency_code TEXT NOT NULL DEFAULT 'PHP' CHECK (currency_code = 'PHP'), -- PHP only for MVP

  -- Timestamps (audit trail)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(household_id, category_id, month) -- Prevent duplicate budgets for same category/month
);

-- =====================================================
-- Table and Column Comments (Decision #80)
-- =====================================================

COMMENT ON TABLE budgets IS 'Monthly budget targets (reference values only, not balances). Budgets are spending targets only - no balance rollover. Actual spending always calculated from transactions. Month boundaries use profiles.timezone for display (Decision #80, #79)';

COMMENT ON COLUMN budgets.month IS 'First day of month (e.g., 2024-01-01). Stored as DATE, timezone-agnostic. Month boundaries for reporting use profiles.timezone';

COMMENT ON COLUMN budgets.month_key IS 'Generated column: YYYYMM format (e.g., 202401) for fast monthly queries. Auto-calculated from month field';

COMMENT ON COLUMN budgets.amount_cents IS 'Target spending amount in cents. Budgets are reference targets only - can copy previous month targets forward but no mathematical rollover (Decision #80)';

COMMENT ON COLUMN budgets.currency_code IS 'PHP only for MVP - multi-currency in Phase 2';

-- =====================================================
-- 2. Create Performance Indexes (Decision #64)
-- =====================================================
-- Per DATABASE.md Query Index Map
-- These indexes support budget queries and comparisons

-- Single-column indexes
CREATE INDEX idx_budgets_household ON budgets(household_id);
COMMENT ON INDEX idx_budgets_household IS 'Supports household filtering for budget queries';

CREATE INDEX idx_budgets_month ON budgets(month);
COMMENT ON INDEX idx_budgets_month IS 'Supports month range queries for budget history';

CREATE INDEX idx_budgets_month_key ON budgets(month_key);
COMMENT ON INDEX idx_budgets_month_key IS 'CRITICAL: Fast monthly budget lookups using YYYYMM integer (e.g., WHERE month_key = 202401)';

CREATE INDEX idx_budgets_category ON budgets(category_id);
COMMENT ON INDEX idx_budgets_category IS 'Supports category-based budget queries';

-- Compound index for most common query pattern
CREATE INDEX idx_budgets_household_month ON budgets(household_id, month_key);
COMMENT ON INDEX idx_budgets_household_month IS 'Compound index for hot query: Get all budgets for household in specific month';

-- =====================================================
-- 3. Enable Row Level Security (RLS)
-- =====================================================

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. Create RLS Policies
-- =====================================================
-- Single household MVP: All authenticated users can manage budgets

-- Policy: Manage budgets (all operations)
-- Single household - all authenticated users can view and modify budgets
CREATE POLICY "Manage budgets"
  ON budgets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "Manage budgets" ON budgets IS
  'Single household MVP - all authenticated users can manage budgets. Will be refined for multi-household in Phase 2';

-- =====================================================
-- 5. Create Auto-Update Timestamp Trigger
-- =====================================================
-- Uses existing update_updated_at_column() function from transactions migration

CREATE TRIGGER update_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TRIGGER update_budgets_updated_at ON budgets IS
  'Automatically updates updated_at timestamp on row modification';

-- =====================================================
-- 6. Verification Queries
-- =====================================================

DO $$
DECLARE
  column_count INT;
  index_count INT;
  trigger_count INT;
  policy_count INT;
  generated_col_exists BOOLEAN;
BEGIN
  -- Check columns
  SELECT COUNT(*) INTO column_count
  FROM information_schema.columns
  WHERE table_name = 'budgets';

  IF column_count < 8 THEN
    RAISE EXCEPTION 'Budgets table has insufficient columns (found %)', column_count;
  END IF;

  -- Check month_key is a generated column
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'budgets'
      AND column_name = 'month_key'
      AND is_generated = 'ALWAYS'
  ) INTO generated_col_exists;

  IF NOT generated_col_exists THEN
    RAISE EXCEPTION 'month_key column is not properly configured as a generated column';
  END IF;

  -- Check indexes (should have 5 custom indexes + 1 primary key + 1 unique constraint = 7 total)
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE tablename = 'budgets';

  IF index_count < 5 THEN
    RAISE WARNING 'Expected at least 5 custom indexes, found %', index_count;
  END IF;

  -- Check triggers (should have 1: updated_at)
  SELECT COUNT(*) INTO trigger_count
  FROM information_schema.triggers
  WHERE event_object_table = 'budgets';

  IF trigger_count < 1 THEN
    RAISE WARNING 'Expected at least 1 trigger, found %', trigger_count;
  END IF;

  -- Check RLS policies (should have 1: all operations)
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'budgets';

  IF policy_count != 1 THEN
    RAISE WARNING 'Expected 1 RLS policy, found %', policy_count;
  END IF;

  RAISE NOTICE 'Budgets table created successfully with % columns, % indexes, % triggers, % policies',
    column_count, index_count, trigger_count, policy_count;

  RAISE NOTICE 'Generated column month_key verified successfully';
END $$;

COMMIT;

-- =====================================================
-- Rollback Instructions
-- =====================================================
-- To rollback this migration:
--
-- BEGIN;
-- DROP TABLE IF EXISTS budgets CASCADE;
-- COMMIT;
--
-- Note: This will also drop:
-- - All indexes on budgets table
-- - All triggers on budgets table
-- - All RLS policies on budgets table
-- - The update_updated_at_column() function is NOT dropped (shared with other tables)
-- =====================================================
