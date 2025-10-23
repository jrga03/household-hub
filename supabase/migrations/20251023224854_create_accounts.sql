-- Migration: Create Accounts Table
-- Purpose: Create the accounts table for managing financial accounts (bank, investment, credit card, cash, e-wallet)
-- References: DATABASE.md lines 105-131, RLS-POLICIES.md lines 44-106, chunk 004-accounts-schema
-- Safety: This is a new table creation with no data dependencies

BEGIN;

-- Create accounts table
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,

  -- Account details
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bank', 'investment', 'credit_card', 'cash', 'e-wallet')),
  initial_balance_cents BIGINT DEFAULT 0,
  currency_code TEXT DEFAULT 'PHP' CHECK (currency_code = 'PHP'),

  -- Visibility
  visibility TEXT DEFAULT 'household' CHECK (visibility IN ('household', 'personal')),
  owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- UI customization
  color TEXT DEFAULT '#3B82F6',
  icon TEXT DEFAULT 'building-2',
  sort_order INT DEFAULT 0,

  -- Soft delete
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(household_id, name)
);

-- Comment on table
COMMENT ON TABLE accounts IS 'Financial accounts (bank, investment, credit card, cash, e-wallet) with household or personal visibility';

-- Comments on key columns
COMMENT ON COLUMN accounts.household_id IS 'Default household UUID - supports multi-household architecture';
COMMENT ON COLUMN accounts.initial_balance_cents IS 'Starting balance in cents (1 PHP = 100 cents) - always positive';
COMMENT ON COLUMN accounts.currency_code IS 'MVP enforces PHP only - multi-currency in Phase 2';
COMMENT ON COLUMN accounts.visibility IS 'household = visible to all household members, personal = owner only';
COMMENT ON COLUMN accounts.owner_user_id IS 'Required for personal accounts, NULL for household accounts';
COMMENT ON COLUMN accounts.is_active IS 'Soft delete flag - never truly delete accounts to preserve transaction history';

-- Indexes for performance
CREATE INDEX idx_accounts_household ON accounts(household_id);
CREATE INDEX idx_accounts_active ON accounts(is_active);
CREATE INDEX idx_accounts_visibility ON accounts(visibility);
CREATE INDEX idx_accounts_owner ON accounts(owner_user_id) WHERE owner_user_id IS NOT NULL;

-- Comment on indexes
COMMENT ON INDEX idx_accounts_household IS 'Core query pattern: list accounts by household';
COMMENT ON INDEX idx_accounts_active IS 'Filter out soft-deleted accounts (WHERE is_active = true)';
COMMENT ON INDEX idx_accounts_visibility IS 'Supports visibility-based filtering';
COMMENT ON INDEX idx_accounts_owner IS 'Partial index for personal account ownership queries';

-- Enable RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- View accounts: household accounts or own personal accounts (within same household)
CREATE POLICY "accounts_select"
  ON accounts FOR SELECT
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  );

-- Create accounts: in user's household only
CREATE POLICY "accounts_insert"
  ON accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  );

-- Update accounts: household accounts or own personal accounts (within same household)
CREATE POLICY "accounts_update"
  ON accounts FOR UPDATE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  );

-- Delete accounts: household accounts or own personal accounts (within same household)
CREATE POLICY "accounts_delete"
  ON accounts FOR DELETE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  );

-- Comment on policies
COMMENT ON POLICY "accounts_select" ON accounts IS 'Users can view household accounts and their own personal accounts within their household';
COMMENT ON POLICY "accounts_insert" ON accounts IS 'Users can create accounts in their household only';
COMMENT ON POLICY "accounts_update" ON accounts IS 'Users can update household accounts or their own personal accounts';
COMMENT ON POLICY "accounts_delete" ON accounts IS 'Users can delete household accounts or their own personal accounts (soft delete recommended)';

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_accounts_updated_at() IS 'Automatically updates the updated_at timestamp on row modification';

CREATE TRIGGER accounts_updated_at
BEFORE UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION update_accounts_updated_at();

COMMENT ON TRIGGER accounts_updated_at ON accounts IS 'Ensures updated_at is automatically set on every UPDATE';

COMMIT;

-- Rollback instructions:
-- To rollback this migration, run:
-- BEGIN;
-- DROP TRIGGER IF EXISTS accounts_updated_at ON accounts;
-- DROP FUNCTION IF EXISTS update_accounts_updated_at();
-- DROP POLICY IF EXISTS "accounts_delete" ON accounts;
-- DROP POLICY IF EXISTS "accounts_update" ON accounts;
-- DROP POLICY IF EXISTS "accounts_insert" ON accounts;
-- DROP POLICY IF EXISTS "accounts_select" ON accounts;
-- DROP INDEX IF EXISTS idx_accounts_owner;
-- DROP INDEX IF EXISTS idx_accounts_visibility;
-- DROP INDEX IF EXISTS idx_accounts_active;
-- DROP INDEX IF EXISTS idx_accounts_household;
-- DROP TABLE IF EXISTS accounts CASCADE;
-- COMMIT;
