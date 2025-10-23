-- =====================================================
-- Household Hub - Seed Data
-- =====================================================
-- Purpose: Test data for local development and testing
-- WARNING: Do NOT run this on production database!
-- =====================================================

BEGIN;

-- Clean up existing seed data (idempotent seeds)
DELETE FROM accounts WHERE name IN ('BPI Savings', 'Cash Wallet', 'BDO Credit Card');

-- =====================================================
-- Seed Accounts
-- =====================================================

-- Household accounts (visible to all users in the household)
INSERT INTO accounts (
  name,
  type,
  initial_balance_cents,
  visibility,
  color,
  icon,
  sort_order
) VALUES
  -- Bank account: ₱10,000.00
  ('BPI Savings', 'bank', 1000000, 'household', '#3B82F6', 'building-2', 1),

  -- Cash account: ₱500.00
  ('Cash Wallet', 'cash', 50000, 'household', '#10B981', 'wallet', 2),

  -- Credit card: ₱0.00 starting balance
  ('BDO Credit Card', 'credit_card', 0, 'household', '#EF4444', 'credit-card', 3);

COMMIT;

-- =====================================================
-- Personal Account Example (COMMENTED OUT)
-- =====================================================
-- To add a personal account for testing:
-- 1. Get your user ID from Supabase Dashboard → Authentication → Users
-- 2. Uncomment and replace 'YOUR-USER-UUID-HERE' below
-- 3. Run this seed file

-- INSERT INTO accounts (
--   name,
--   type,
--   initial_balance_cents,
--   visibility,
--   owner_user_id,
--   color,
--   icon,
--   sort_order
-- ) VALUES
--   -- E-wallet: ₱250.00
--   ('Personal GCash', 'e-wallet', 25000, 'personal', 'YOUR-USER-UUID-HERE', '#F59E0B', 'smartphone', 4);

-- =====================================================
-- Verification Query
-- =====================================================
-- Run this to verify seed data loaded correctly:
-- SELECT id, name, type, initial_balance_cents / 100.0 as balance_php, visibility, is_active
-- FROM accounts
-- ORDER BY sort_order;
--
-- Expected Results:
-- - 3 household accounts
-- - BPI Savings: ₱10,000.00
-- - Cash Wallet: ₱500.00
-- - BDO Credit Card: ₱0.00
-- - All have is_active = true
