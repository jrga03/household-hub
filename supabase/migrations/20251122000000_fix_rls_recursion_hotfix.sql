-- =====================================================
-- HOTFIX: Restore SECURITY DEFINER to prevent RLS recursion
-- =====================================================
-- ISSUE: Stack depth limit exceeded (PostgreSQL error 54001)
--
-- ROOT CAUSE:
--   Migration 20251110194431_add_debt_tracking.sql (line 418) changed
--   get_user_household_id() from SECURITY DEFINER to SECURITY INVOKER,
--   reintroducing the infinite recursion bug that was fixed in
--   20251024000000_fix_rls_infinite_recursion.sql
--
-- RECURSION CHAIN:
--   1. User queries any table (accounts, transactions, debts, etc.)
--   2. RLS policy checks: household_id = get_user_household_id()
--   3. get_user_household_id() executes: SELECT FROM profiles
--   4. profiles RLS policy checks: household_id = get_user_household_id()
--   5. Infinite loop → Stack overflow
--
-- THE FIX:
--   SECURITY DEFINER runs the function with postgres superuser privileges,
--   bypassing RLS when querying profiles, which breaks the recursion chain.
--
-- AFFECTED TABLES:
--   All tables using get_user_household_id() in RLS policies:
--   - profiles, accounts, categories, transactions, transaction_events
--   - budgets, debts, internal_debts, debt_payments
-- =====================================================

-- Replace the function directly (CREATE OR REPLACE handles dependencies)
-- No need to DROP first since RLS policies depend on this function
CREATE OR REPLACE FUNCTION get_user_household_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER  -- ⚠️ CRITICAL: Must be DEFINER to bypass RLS and prevent recursion
STABLE
SET search_path = public
AS $$
  SELECT household_id FROM profiles WHERE id = auth.uid();
$$;

-- Add protective comment
COMMENT ON FUNCTION get_user_household_id() IS
  'Returns current authenticated user household_id.

   CRITICAL: MUST use SECURITY DEFINER to bypass RLS and prevent infinite recursion.

   WHY: This function is called by RLS policies on the profiles table itself.
   If it used SECURITY INVOKER, querying profiles would trigger RLS, which calls
   this function, which queries profiles, which triggers RLS... infinite loop.

   SECURITY DEFINER runs with postgres superuser privileges, bypassing RLS when
   this function queries the profiles table.

   DO NOT change to SECURITY INVOKER without understanding the recursion implications.

   Originally fixed in: 20251024000000_fix_rls_infinite_recursion.sql
   Regression introduced in: 20251110194431_add_debt_tracking.sql
   Hotfix applied in: 20251122000000_fix_rls_recursion_hotfix.sql';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_household_id() TO authenticated;

-- Revoke from anon to prevent unauthorized access
REVOKE EXECUTE ON FUNCTION get_user_household_id() FROM anon;
