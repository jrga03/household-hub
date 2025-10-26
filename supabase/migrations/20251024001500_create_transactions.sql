-- =====================================================
-- Migration: Create Transactions Table
-- =====================================================
-- Purpose: Create transactions table with complete schema, indexes, triggers, and RLS policies
-- References: DATABASE.md lines 160-219, Decision #71 (DATE type), Decision #60 (transfers)
-- Safety: This migration creates a new table. Recommend snapshot before running.
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Create Transactions Table
-- =====================================================

CREATE TABLE transactions (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Household isolation (multi-household architecture ready)
  household_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Core transaction fields
  date DATE NOT NULL, -- CRITICAL: DATE type (user's local date is canonical, see Decision #71)
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0), -- Always positive (BIGINT max: ~92 quadrillion PHP)
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  currency_code TEXT NOT NULL DEFAULT 'PHP' CHECK (currency_code = 'PHP'), -- PHP only for MVP

  -- Relationships
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL, -- Child categories only
  transfer_group_id UUID, -- Links paired transfer transactions (exactly 2 per group, see Decision #60)

  -- Status and filtering
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cleared')),
  visibility TEXT NOT NULL DEFAULT 'household' CHECK (visibility IN ('household', 'personal')),

  -- User tracking
  created_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  tagged_user_ids UUID[] DEFAULT '{}', -- Users mentioned/involved in this transaction (@mentions)

  -- Additional data
  notes TEXT,

  -- Import tracking
  import_key TEXT, -- SHA-256 hash for duplicate detection during CSV imports (Phase B)

  -- Sync and audit
  device_id TEXT, -- Device ID from hybrid strategy (Decision #75)

  -- Timestamps (audit trail - stored as TIMESTAMPTZ for precision)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE transactions IS 'Main transaction table with event sourcing support';
COMMENT ON COLUMN transactions.date IS 'Transaction date as DATE type - user local date is canonical (Decision #71)';
COMMENT ON COLUMN transactions.amount_cents IS 'Always positive amount in cents, type field indicates income/expense (Decision #9)';
COMMENT ON COLUMN transactions.transfer_group_id IS 'Links paired transfer transactions - max 2 per group (Decision #60)';
COMMENT ON COLUMN transactions.currency_code IS 'PHP only for MVP - multi-currency in Phase 2';
COMMENT ON COLUMN transactions.created_at IS 'Audit timestamp - precise event time in UTC';

-- =====================================================
-- 2. Create Performance Indexes (Decision #64)
-- =====================================================
-- Per DATABASE.md Query Index Map (lines 1226-1346)
-- These indexes support hot queries for transaction lists, analytics, and budgets

-- Single-column indexes
CREATE INDEX idx_transactions_household ON transactions(household_id);
CREATE INDEX idx_transactions_date ON transactions(date DESC); -- Hot Query #1: Date range queries (also supports monthly via range)
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_visibility ON transactions(visibility);
CREATE INDEX idx_transactions_created_by ON transactions(created_by_user_id);
CREATE INDEX idx_transactions_type ON transactions(type);

-- NOTE: Removed idx_transactions_month functional index (DATE_TRUNC not IMMUTABLE)
-- Monthly queries should use date range with idx_transactions_date:
-- WHERE date >= '2024-01-01' AND date < '2024-02-01'

-- Partial indexes (filtered for efficiency)
CREATE INDEX idx_transactions_transfer ON transactions(transfer_group_id)
  WHERE transfer_group_id IS NOT NULL; -- Only index actual transfers

CREATE INDEX idx_transactions_import_key ON transactions(import_key)
  WHERE import_key IS NOT NULL; -- Only index imported transactions

-- GIN index for array column (Hot Query #5: @mentions)
CREATE INDEX idx_transactions_tagged_users ON transactions USING GIN (tagged_user_ids);

-- Compound indexes for common filter combinations
CREATE INDEX idx_transactions_account_date ON transactions(account_id, date DESC); -- Hot Query #3: Account balance
CREATE INDEX idx_transactions_category_date ON transactions(category_id, date DESC); -- Hot Query #2: Category totals
CREATE INDEX idx_transactions_status_date ON transactions(status, date DESC); -- Filter pending/cleared by date
CREATE INDEX idx_transactions_household_visibility ON transactions(household_id, visibility); -- Household vs personal filtering

-- =====================================================
-- 3. Create Transfer Integrity Triggers (Decision #60)
-- =====================================================
-- Ensures transfer transactions maintain data integrity:
-- - Maximum 2 transactions per transfer_group_id
-- - Opposite types (one income, one expense)
-- - Matching amounts

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

  -- Prevent changing transfer_group_id after initial creation (immutability)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.transfer_group_id IS NOT NULL AND OLD.transfer_group_id IS DISTINCT FROM NEW.transfer_group_id THEN
      RAISE EXCEPTION 'Cannot modify transfer_group_id once set (current: %, attempted: %)',
        OLD.transfer_group_id, NEW.transfer_group_id;
    END IF;
  END IF;

  -- Count existing transactions in this transfer group (excluding current row)
  SELECT COUNT(*), SUM(amount_cents)
  INTO transfer_count, total_amount
  FROM transactions
  WHERE transfer_group_id = NEW.transfer_group_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Ensure maximum 2 transactions per transfer group
  IF transfer_count >= 2 THEN
    RAISE EXCEPTION 'Transfer group % can only have 2 transactions (found % existing)',
      NEW.transfer_group_id, transfer_count;
  END IF;

  -- If this is the second transaction, verify opposite types and matching amounts
  IF transfer_count = 1 THEN
    -- Get the type of the other transaction
    SELECT type INTO opposite_type
    FROM transactions
    WHERE transfer_group_id = NEW.transfer_group_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- Ensure opposite types (one income, one expense)
    IF NEW.type = opposite_type THEN
      RAISE EXCEPTION 'Transfer must have one income and one expense transaction (both are %)', NEW.type;
    END IF;

    -- Ensure same amount
    IF NEW.amount_cents != total_amount THEN
      RAISE EXCEPTION 'Transfer transactions must have matching amounts (% vs %)',
        NEW.amount_cents, total_amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_transfer_integrity() IS 'Validates transfer pair integrity: max 2 transactions, opposite types, matching amounts';

-- =====================================================
-- Function: Handle Transfer Deletion
-- =====================================================
-- When one leg of a transfer is deleted, nullify the paired transaction's transfer_group_id
-- This converts the remaining transaction to a regular transaction

CREATE OR REPLACE FUNCTION handle_transfer_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- If deleting a transfer transaction, nullify the pair's transfer_group_id
  IF OLD.transfer_group_id IS NOT NULL THEN
    UPDATE transactions
    SET transfer_group_id = NULL
    WHERE transfer_group_id = OLD.transfer_group_id
      AND id != OLD.id;

    -- Log the orphaned transaction for audit trail
    RAISE NOTICE 'Transfer deleted: transfer_group_id %, paired transaction converted to regular transaction',
      OLD.transfer_group_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION handle_transfer_deletion() IS 'Nullifies paired transaction transfer_group_id when one leg is deleted';

-- =====================================================
-- Attach Triggers
-- =====================================================

CREATE TRIGGER ensure_transfer_integrity
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION check_transfer_integrity();

CREATE TRIGGER handle_transfer_deletion_trigger
  BEFORE DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION handle_transfer_deletion();

-- =====================================================
-- 4. Create Auto-Update Timestamp Trigger
-- =====================================================

-- Create reusable updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS
  'Automatically updates the updated_at column to current timestamp on row updates';

-- Apply trigger to transactions table
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. Enable Row Level Security (RLS)
-- =====================================================

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. Create RLS Policies
-- =====================================================
-- Note: Using get_user_household_id() SECURITY DEFINER function to avoid infinite recursion
-- (established in migration 20251024000000_fix_rls_infinite_recursion.sql)

-- Policy: View transactions
-- Users can view:
-- 1. Household transactions (visibility = 'household')
-- 2. Their own personal transactions (created_by_user_id = current user)
CREATE POLICY "View transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    visibility = 'household'
    OR created_by_user_id = auth.uid()
  );

COMMENT ON POLICY "View transactions" ON transactions IS
  'Users can view household transactions or their own personal transactions';

-- Policy: Create transactions
-- Users can create transactions and must be set as the creator
CREATE POLICY "Create transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

COMMENT ON POLICY "Create transactions" ON transactions IS
  'Users can create transactions, must be set as creator';

-- Policy: Update transactions
-- Users can update:
-- 1. Their own transactions (created_by_user_id = current user)
-- 2. Household transactions (visibility = 'household')
CREATE POLICY "Update transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR visibility = 'household'
  );

COMMENT ON POLICY "Update transactions" ON transactions IS
  'Users can update their own transactions or household transactions';

-- Policy: Delete transactions
-- Only creator can delete to prevent accidental data loss
CREATE POLICY "Delete transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (created_by_user_id = auth.uid());

COMMENT ON POLICY "Delete transactions" ON transactions IS
  'Only transaction creator can delete to prevent accidental data loss';

-- =====================================================
-- 7. Verification Queries
-- =====================================================
-- Verify table structure
DO $$
DECLARE
  column_count INT;
  index_count INT;
  trigger_count INT;
  policy_count INT;
BEGIN
  -- Check columns
  SELECT COUNT(*) INTO column_count
  FROM information_schema.columns
  WHERE table_name = 'transactions';

  IF column_count < 18 THEN
    RAISE EXCEPTION 'Transactions table has insufficient columns (found %)', column_count;
  END IF;

  -- Check indexes (should have 15 custom indexes + 1 primary key = 16 total)
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE tablename = 'transactions';

  IF index_count < 15 THEN
    RAISE WARNING 'Expected at least 15 indexes (plus primary key), found %', index_count;
  END IF;

  -- Check triggers (should have 3: transfer integrity, transfer deletion, updated_at)
  SELECT COUNT(*) INTO trigger_count
  FROM information_schema.triggers
  WHERE event_object_table = 'transactions';

  IF trigger_count < 3 THEN
    RAISE WARNING 'Expected at least 3 triggers, found %', trigger_count;
  END IF;

  -- Check RLS policies (should have 4: SELECT, INSERT, UPDATE, DELETE)
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'transactions';

  IF policy_count != 4 THEN
    RAISE WARNING 'Expected 4 RLS policies, found %', policy_count;
  END IF;

  RAISE NOTICE 'Transactions table created successfully with % columns, % indexes, % triggers, % policies',
    column_count, index_count, trigger_count, policy_count;
END $$;

COMMIT;

-- =====================================================
-- Rollback Instructions
-- =====================================================
-- To rollback this migration:
--
-- BEGIN;
-- DROP TABLE IF EXISTS transactions CASCADE;
-- DROP FUNCTION IF EXISTS check_transfer_integrity() CASCADE;
-- DROP FUNCTION IF EXISTS handle_transfer_deletion() CASCADE;
-- COMMIT;
--
-- Note: This will also drop:
-- - All indexes on transactions table
-- - All triggers on transactions table
-- - All RLS policies on transactions table
-- =====================================================
