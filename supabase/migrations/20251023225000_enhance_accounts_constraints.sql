-- Migration: Enhance Accounts and Profiles Constraints
-- Purpose: Add data integrity constraints identified in code review
-- References: Code review feedback from chunk 004 implementation
-- Dependencies: 20251023224800_create_profiles.sql, 20251023224854_create_accounts.sql

BEGIN;

-- =====================================================
-- 1. Add ownership validation constraint to accounts
-- =====================================================
-- Ensures personal accounts MUST have an owner, and household accounts must NOT have an owner

ALTER TABLE accounts
ADD CONSTRAINT valid_ownership CHECK (
  (visibility = 'household' AND owner_user_id IS NULL) OR
  (visibility = 'personal' AND owner_user_id IS NOT NULL)
);

COMMENT ON CONSTRAINT valid_ownership ON accounts IS 'Enforces business rule: personal accounts require owner, household accounts must not have owner';

-- =====================================================
-- 2. Add theme preference validation to profiles
-- =====================================================
-- Ensures only valid theme values can be stored

ALTER TABLE profiles
ADD CONSTRAINT valid_theme_preference CHECK (theme_preference IN ('light', 'dark', 'system'));

COMMENT ON CONSTRAINT valid_theme_preference ON profiles IS 'Enforces valid theme values: light, dark, or system';

-- =====================================================
-- 3. Wrap seed data in transaction (already done in seed.sql)
-- =====================================================
-- This is a reminder that seed.sql should be wrapped in BEGIN/COMMIT
-- See updated seed.sql file

-- =====================================================
-- 4. Improve handle_new_user trigger error handling
-- =====================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Attempt to create profile
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  -- Verify profile exists (either newly created or pre-existing)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'Failed to create profile for user % with email %', NEW.id, NEW.email
      USING HINT = 'Check profile table constraints and permissions';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and re-raise
    RAISE WARNING 'Profile creation failed: %', SQLERRM;
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION handle_new_user() IS 'Creates profile automatically when user signs up - with enhanced error handling';

COMMIT;

-- =====================================================
-- Rollback Instructions
-- =====================================================
-- To rollback this migration:
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS handle_new_user();
-- -- Restore original function from 20251023224800_create_profiles.sql
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS valid_theme_preference;
-- ALTER TABLE accounts DROP CONSTRAINT IF EXISTS valid_ownership;
-- COMMIT;
-- =====================================================
