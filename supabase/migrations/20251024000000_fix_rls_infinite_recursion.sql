-- =====================================================
-- Migration: Fix RLS Infinite Recursion
-- =====================================================
-- Purpose: Fix infinite recursion error (42P17) in RLS policies
-- Problem: Policies query profiles table which triggers profiles RLS → infinite loop
-- Solution: Create SECURITY DEFINER function to bypass RLS when getting household_id
-- References: Supabase RLS best practices for cross-table references
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Create Helper Function (SECURITY DEFINER)
-- =====================================================
-- This function bypasses RLS to safely get the user's household_id
-- SECURITY DEFINER means it runs with the privileges of the function owner (postgres)

CREATE OR REPLACE FUNCTION get_user_household_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT household_id FROM profiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION get_user_household_id() IS 'Returns current user household_id, bypassing RLS to prevent infinite recursion';

-- =====================================================
-- 2. Fix Profiles RLS Policies
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

-- Recreate with fixed pattern
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  TO authenticated
  USING (household_id = get_user_household_id());

CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

COMMENT ON POLICY "profiles_select" ON profiles IS 'Users can view all profiles in their household';
COMMENT ON POLICY "profiles_update" ON profiles IS 'Users can only update their own profile';

-- =====================================================
-- 3. Fix Accounts RLS Policies
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "accounts_select" ON accounts;
DROP POLICY IF EXISTS "accounts_insert" ON accounts;
DROP POLICY IF EXISTS "accounts_update" ON accounts;
DROP POLICY IF EXISTS "accounts_delete" ON accounts;

-- Recreate with fixed pattern
CREATE POLICY "accounts_select"
  ON accounts FOR SELECT
  TO authenticated
  USING (
    household_id = get_user_household_id()
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  );

CREATE POLICY "accounts_insert"
  ON accounts FOR INSERT
  TO authenticated
  WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "accounts_update"
  ON accounts FOR UPDATE
  TO authenticated
  USING (
    household_id = get_user_household_id()
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  )
  WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "accounts_delete"
  ON accounts FOR DELETE
  TO authenticated
  USING (
    household_id = get_user_household_id()
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  );

COMMENT ON POLICY "accounts_select" ON accounts IS 'Users can view household accounts or own personal accounts';
COMMENT ON POLICY "accounts_insert" ON accounts IS 'Users can create accounts in their household';
COMMENT ON POLICY "accounts_update" ON accounts IS 'Users can update household accounts or own personal accounts';
COMMENT ON POLICY "accounts_delete" ON accounts IS 'Users can delete household accounts or own personal accounts';

-- =====================================================
-- 4. Fix Categories RLS Policies
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "categories_select" ON categories;
DROP POLICY IF EXISTS "categories_insert" ON categories;
DROP POLICY IF EXISTS "categories_update" ON categories;
DROP POLICY IF EXISTS "categories_delete" ON categories;

-- Recreate with fixed pattern
CREATE POLICY "categories_select"
  ON categories FOR SELECT
  TO authenticated
  USING (household_id = get_user_household_id());

CREATE POLICY "categories_insert"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "categories_update"
  ON categories FOR UPDATE
  TO authenticated
  USING (household_id = get_user_household_id())
  WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "categories_delete"
  ON categories FOR DELETE
  TO authenticated
  USING (household_id = get_user_household_id());

COMMENT ON POLICY "categories_select" ON categories IS 'Users can view categories in their household';
COMMENT ON POLICY "categories_insert" ON categories IS 'Users can create categories in their household';
COMMENT ON POLICY "categories_update" ON categories IS 'Users can update categories in their household';
COMMENT ON POLICY "categories_delete" ON categories IS 'Users can delete categories in their household';

COMMIT;

-- =====================================================
-- Rollback Instructions
-- =====================================================
-- To rollback this migration:
--
-- BEGIN;
-- -- Revert to original policies (will cause infinite recursion again)
-- DROP FUNCTION IF EXISTS get_user_household_id();
-- -- Then recreate original policies with subquery pattern
-- COMMIT;
-- =====================================================
