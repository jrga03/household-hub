-- Migration: Add Devices Table
-- Purpose: Create devices table for multi-device sync support (Decision #82)
-- References:
--   - DECISIONS.md #82: Devices table promoted to MVP
--   - DECISIONS.md #75: Hybrid device ID strategy
--   - SYNC-ENGINE.md lines 1123-1303: Device identification approach
--   - docs/implementation/chunks/027-devices-table/instructions.md
-- Safety: This migration is ADDITIVE ONLY - no data loss risk
-- Note: No snapshot required (new table creation)

BEGIN;

-- ============================================================================
-- Trigger Function (Defensive - may already exist from other tables)
-- ============================================================================

-- Ensure trigger function exists for updated_at auto-update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Devices Table
-- ============================================================================

CREATE TABLE devices (
  -- Device ID from DeviceManager (hybrid: IndexedDB -> localStorage -> FingerprintJS -> UUID)
  -- Primary key for device identification across sync operations
  id TEXT PRIMARY KEY,

  -- Ownership
  -- Links device to authenticated user
  -- Using auth.users(id) directly (matches profiles table pattern)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Household association
  -- NO FK constraint - households table doesn't exist in MVP (Decision #59)
  -- Multi-household architecture is Phase 2+
  -- Default to single household for MVP
  household_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Device metadata for UX and sync capabilities
  name TEXT NOT NULL,                    -- e.g., "Chrome on macOS"
  platform TEXT NOT NULL CHECK (
    platform IN ('web', 'pwa-ios', 'pwa-android', 'pwa-desktop')
  ),
  fingerprint TEXT NOT NULL,             -- Browser fingerprint for continuity

  -- Status tracking
  is_active BOOLEAN DEFAULT true NOT NULL,
  last_seen TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Audit timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- Indexes (4 strategic indexes for common query patterns)
-- ============================================================================

-- User's devices lookup (most common query)
CREATE INDEX idx_devices_user_id ON devices(user_id);

-- Household devices lookup (for multi-device management UI)
CREATE INDEX idx_devices_household_id ON devices(household_id);

-- Active devices filter (partial index for performance)
-- Only indexes rows where is_active = true (smaller index)
CREATE INDEX idx_devices_active ON devices(is_active) WHERE is_active = true;

-- Last seen ordering (for "stale device" cleanup)
CREATE INDEX idx_devices_last_seen ON devices(last_seen);

-- ============================================================================
-- Trigger for updated_at
-- ============================================================================

CREATE TRIGGER update_devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can view their own devices
CREATE POLICY "Users can view their own devices"
  ON devices FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 2: Users can register their own devices
CREATE POLICY "Users can register their own devices"
  ON devices FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy 3: Users can update their own devices
CREATE POLICY "Users can update their own devices"
  ON devices FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy 4: Users can delete their own devices
CREATE POLICY "Users can delete their own devices"
  ON devices FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- Documentation Comments
-- ============================================================================

COMMENT ON TABLE devices IS 'Registry of devices for multi-device sync. Each device (browser/PWA instance) gets a unique entry for event attribution and conflict resolution. Promoted to MVP (Decision #82) to avoid migration pain and support multi-device testing.';

COMMENT ON COLUMN devices.id IS 'Device ID from DeviceManager hybrid strategy (fingerprint or UUID). Primary key for device identification. Survives cache clears when using FingerprintJS.';

COMMENT ON COLUMN devices.name IS 'Human-readable device name (e.g., "Chrome on macOS"). Detected automatically from user agent. Used for display in device management UI.';

COMMENT ON COLUMN devices.platform IS 'Device platform type. Used to determine sync capabilities (e.g., iOS lacks Background Sync API). Values: web, pwa-ios, pwa-android, pwa-desktop.';

COMMENT ON COLUMN devices.fingerprint IS 'Browser fingerprint from FingerprintJS for device continuity after cache clear. May match device ID if fingerprint-based. Enables device history merging for vector clocks (Phase B).';

COMMENT ON COLUMN devices.last_seen IS 'Last activity timestamp. Updated on app focus and sync operations. Used to identify inactive/stale devices for cleanup (>90 days inactive).';

COMMIT;

-- ============================================================================
-- Rollback Instructions
-- ============================================================================
-- If this migration needs to be rolled back, create a new migration with:
--
-- BEGIN;
--
-- -- Drop RLS policies (reverse order)
-- DROP POLICY IF EXISTS "Users can delete their own devices" ON devices;
-- DROP POLICY IF EXISTS "Users can update their own devices" ON devices;
-- DROP POLICY IF EXISTS "Users can register their own devices" ON devices;
-- DROP POLICY IF EXISTS "Users can view their own devices" ON devices;
--
-- -- Drop trigger
-- DROP TRIGGER IF EXISTS update_devices_updated_at ON devices;
--
-- -- Drop indexes (reverse order)
-- DROP INDEX IF EXISTS idx_devices_last_seen;
-- DROP INDEX IF EXISTS idx_devices_active;
-- DROP INDEX IF EXISTS idx_devices_household_id;
-- DROP INDEX IF EXISTS idx_devices_user_id;
--
-- -- Drop table
-- DROP TABLE IF EXISTS devices;
--
-- COMMIT;
--
-- WARNING: Rolling back will delete ALL device records and history.
-- Only rollback if migration fails during initial application.
