-- =====================================================
-- Migration: Create Profiles Table
-- =====================================================
-- Purpose: User profiles extending Supabase Auth
-- Dependencies: auth.users (Supabase Auth - auto-created)
-- Referenced by: accounts, devices, budgets, etc.
-- Documentation: docs/initial plan/DATABASE.md lines 48-76
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Profiles Table
-- =====================================================
-- Extends auth.users with household and app-specific data
-- One profile per auth.users entry (1:1 relationship)

CREATE TABLE IF NOT EXISTS profiles (
  -- Primary key references Supabase Auth user
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Household membership (MVP: single default household)
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,

  -- User information
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,

  -- Localization
  timezone TEXT DEFAULT 'Asia/Manila',
  -- Note: MVP assumes Asia/Manila timezone for all budget calculations
  -- Multi-household will add household-level timezone (Phase B)

  -- Preferences
  theme_preference TEXT DEFAULT 'system' CHECK (theme_preference IN ('light', 'dark', 'system')),
  notification_preferences JSONB DEFAULT '{"budget_alerts": true, "mentions": true, "due_dates": true}'::jsonb,

  -- Device tracking (hybrid device ID from IndexedDB → localStorage → Fingerprint)
  device_id TEXT,

  -- Audit timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'User profiles extending Supabase Auth with household and app preferences';
COMMENT ON COLUMN profiles.id IS 'References auth.users(id) - one profile per user';
COMMENT ON COLUMN profiles.household_id IS 'Household membership - MVP uses default household for all users';
COMMENT ON COLUMN profiles.timezone IS 'User timezone for budget month boundaries and display formatting';
COMMENT ON COLUMN profiles.device_id IS 'Current device ID from hybrid detection strategy';

-- =====================================================
-- 2. Indexes
-- =====================================================

-- Household-based queries (most common access pattern)
CREATE INDEX idx_profiles_household ON profiles(household_id);

-- Email lookup for user search/mentions
CREATE INDEX idx_profiles_email ON profiles(email);

-- =====================================================
-- 3. Auto-Update Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION update_profiles_updated_at();

COMMENT ON FUNCTION update_profiles_updated_at() IS 'Automatically updates updated_at timestamp on profile changes';

-- =====================================================
-- 4. New User Trigger
-- =====================================================
-- Automatically create profile when user signs up via Supabase Auth

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;  -- Idempotent: skip if profile already exists
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION handle_new_user() IS 'Creates profile automatically when user signs up via Supabase Auth';

-- Trigger on auth.users table (Supabase Auth schema)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- 5. Row Level Security (RLS)
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can view all profiles in their household
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Users can only update their own profile
CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Profiles are created automatically via trigger (no manual INSERT policy needed)

-- Users cannot delete profiles (CASCADE handled by auth.users deletion)
-- No DELETE policy = no manual deletion allowed

COMMENT ON POLICY "profiles_select" ON profiles IS 'Users can view all profiles in their household';
COMMENT ON POLICY "profiles_update" ON profiles IS 'Users can only update their own profile';

COMMIT;

-- =====================================================
-- Rollback Instructions
-- =====================================================
-- If you need to rollback this migration:
--
-- BEGIN;
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS handle_new_user();
-- DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
-- DROP FUNCTION IF EXISTS update_profiles_updated_at();
-- DROP TABLE IF EXISTS profiles CASCADE;
-- COMMIT;
-- =====================================================
