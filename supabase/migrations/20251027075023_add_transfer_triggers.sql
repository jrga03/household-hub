-- Migration: Transfer Integrity Triggers (Standalone)
-- Purpose: Implement/update transfer validation and deletion handling
-- References: DATABASE.md lines 476-543, DECISIONS.md #60
-- Safety: This migration updates existing functions and recreates triggers - no data migration required
-- Context: Separates transfer integrity logic from main transactions migration for cleaner organization

-- Note: This migration uses CREATE OR REPLACE to update functions that were initially
-- defined in migration 20251024001500_create_transactions.sql. The triggers are dropped
-- and recreated to ensure clean attachment to the updated functions.

BEGIN;

-- =====================================================
-- Function: Check Transfer Integrity
-- =====================================================
-- Validates transfer transaction pairs maintain data integrity:
-- - Maximum 2 transactions per transfer_group_id
-- - Opposite types (one income, one expense)
-- - Matching amounts across both transactions
-- - Immutability of transfer_group_id once set (prevents orphaning)
--
-- See Decision #60 for transfer design philosophy

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
  -- This ensures transfer pairs cannot be broken by reassignment
  IF TG_OP = 'UPDATE' THEN
    IF OLD.transfer_group_id IS NOT NULL AND OLD.transfer_group_id IS DISTINCT FROM NEW.transfer_group_id THEN
      RAISE EXCEPTION 'Cannot modify transfer_group_id once set (current: %, attempted: %)',
        OLD.transfer_group_id, NEW.transfer_group_id;
    END IF;
  END IF;

  -- Count existing transactions in this transfer group (excluding current row)
  -- Use COALESCE for INSERT operations where NEW.id may not be set yet
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

COMMENT ON FUNCTION check_transfer_integrity() IS
  'Validates transfer pair integrity: max 2 transactions, opposite types, matching amounts. See Decision #60';

-- =====================================================
-- Function: Handle Transfer Deletion
-- =====================================================
-- When one leg of a transfer is deleted, nullify the paired transaction's transfer_group_id.
-- This converts the remaining transaction to a regular transaction rather than leaving
-- an orphaned transfer reference.
--
-- Example: User deletes "Transfer from Checking to Savings" expense transaction
-- Result: The paired income transaction in Savings account has its transfer_group_id
--         set to NULL, becoming a regular income transaction.

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

COMMENT ON FUNCTION handle_transfer_deletion() IS
  'Nullifies paired transaction transfer_group_id when one leg is deleted to prevent orphaned transfers';

-- =====================================================
-- Attach Triggers (Drop and Recreate)
-- =====================================================
-- Drop existing triggers if they exist, then recreate them to ensure
-- they are attached to the updated function definitions

DROP TRIGGER IF EXISTS ensure_transfer_integrity ON transactions;
CREATE TRIGGER ensure_transfer_integrity
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION check_transfer_integrity();

DROP TRIGGER IF EXISTS handle_transfer_deletion_trigger ON transactions;
CREATE TRIGGER handle_transfer_deletion_trigger
  BEFORE DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION handle_transfer_deletion();

-- =====================================================
-- CRITICAL: Transfer Exclusion Pattern for Analytics and Budgets
-- =====================================================
-- DATABASE.md lines 476-543
--
-- Transfers represent money moving between accounts, NOT income or expenses.
-- Always exclude transfers when calculating income/expense analytics and budget tracking.
--
-- **Rule of Thumb:**
-- - Analytics & Budgets: Exclude transfers (WHERE transfer_group_id IS NULL)
-- - Account Balances: Include transfers (affects balances)
-- - Transfer Reports: Filter to transfers only (WHERE transfer_group_id IS NOT NULL)
--
-- **Example 1: Monthly spending query (CORRECT - excludes transfers)**
-- This calculates actual income and expenses for the month
--
-- SELECT
--   DATE_TRUNC('month', date) as month,
--   SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) as expenses,
--   SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) as income
-- FROM transactions
-- WHERE transfer_group_id IS NULL  -- CRITICAL: Exclude transfers
--   AND status = 'cleared'
-- GROUP BY month;
--
-- **Example 2: Budget vs actual query (CORRECT - excludes transfers)**
-- This compares budget targets to actual spending for categories
--
-- SELECT
--   c.name as category,
--   b.amount_cents as budget_target,
--   COALESCE(SUM(t.amount_cents), 0) as actual_spend
-- FROM budgets b
-- LEFT JOIN categories c ON c.id = b.category_id
-- LEFT JOIN transactions t ON t.category_id = c.id
--   AND t.transfer_group_id IS NULL  -- CRITICAL: Exclude transfers
--   AND DATE_TRUNC('month', t.date) = b.month
--   AND t.type = 'expense'
-- WHERE b.month = '2025-01-01'
-- GROUP BY c.name, b.amount_cents;
--
-- **Example 3: Account balance query (CORRECT - includes all transactions including transfers)**
-- This calculates the current account balance by summing all transactions
--
-- SELECT
--   a.id,
--   a.name,
--   a.initial_balance_cents +
--   COALESCE(SUM(
--     CASE
--       WHEN t.type = 'income' THEN t.amount_cents
--       WHEN t.type = 'expense' THEN -t.amount_cents
--     END
--   ), 0) as balance_cents
-- FROM accounts a
-- LEFT JOIN transactions t ON t.account_id = a.id
-- -- NOTE: Do NOT exclude transfers here - they affect account balances
-- WHERE a.id = 'some-account-id'
-- GROUP BY a.id, a.name, a.initial_balance_cents;
--
-- **Example 4: Transfer report query (shows only transfers)**
-- This displays a report of money moved between accounts
--
-- SELECT
--   t1.date,
--   t1.description,
--   t1.amount_cents,
--   a1.name as from_account,
--   a2.name as to_account
-- FROM transactions t1
-- JOIN transactions t2 ON t1.transfer_group_id = t2.transfer_group_id
--   AND t1.id != t2.id
-- LEFT JOIN accounts a1 ON t1.account_id = a1.id
-- LEFT JOIN accounts a2 ON t2.account_id = a2.id
-- WHERE t1.type = 'expense'  -- Show from expense side (the "from" account)
--   AND t1.transfer_group_id IS NOT NULL
-- ORDER BY t1.date DESC;

COMMIT;

-- =====================================================
-- Rollback Instructions
-- =====================================================
-- This migration only updates function definitions and recreates triggers.
-- No data changes are made, so rollback is not typically necessary.
-- If rollback is needed, restore the previous function definitions from
-- migration 20251024001500_create_transactions.sql lines 100-205.
--
-- To manually rollback (if needed):
-- 1. Re-run the function definitions from migration 20251024001500_create_transactions.sql
-- 2. Drop and recreate the triggers to attach them to the old functions
