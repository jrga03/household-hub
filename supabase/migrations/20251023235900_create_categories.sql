-- Migration: Create Categories Table
-- Purpose: Hierarchical expense categorization with two levels (Parent → Child)
-- References: DATABASE.md lines 134-156, RLS-POLICIES.md lines 108-148
-- Pattern: Follows accounts table migration structure

BEGIN;

-- Create categories table for hierarchical expense categorization
-- Two-level hierarchy: Parent → Child (e.g., Food → Groceries)

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  icon TEXT DEFAULT 'folder',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique category names at each level per household
  UNIQUE(household_id, parent_id, name)
);

-- Comment on table
COMMENT ON TABLE categories IS 'Hierarchical expense categories with two-level structure (Parent → Child)';

-- Comments on key columns
COMMENT ON COLUMN categories.household_id IS 'Default household UUID - supports multi-household architecture';
COMMENT ON COLUMN categories.parent_id IS 'NULL for parent categories, references parent.id for child categories';
COMMENT ON COLUMN categories.color IS 'Hex color code for visual categorization';
COMMENT ON COLUMN categories.icon IS 'Lucide icon name (kebab-case, e.g., shopping-cart)';
COMMENT ON COLUMN categories.is_active IS 'Soft delete flag - inactive categories hidden from selection';

-- Indexes for query performance
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_active ON categories(is_active);
CREATE INDEX idx_categories_household ON categories(household_id);
CREATE INDEX idx_categories_sort ON categories(household_id, parent_id, sort_order);

-- Comment on indexes
COMMENT ON INDEX idx_categories_parent IS 'Supports hierarchical queries (parent-child relationships)';
COMMENT ON INDEX idx_categories_active IS 'Filter out soft-deleted categories (WHERE is_active = true)';
COMMENT ON INDEX idx_categories_household IS 'Core query pattern: list categories by household';
COMMENT ON INDEX idx_categories_sort IS 'Compound index for ordered category display within parents';

-- Enable Row Level Security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view categories in their household
CREATE POLICY "categories_select"
  ON categories FOR SELECT
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- RLS Policy: Users can create categories in their household
CREATE POLICY "categories_insert"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- RLS Policy: Users can update categories in their household
CREATE POLICY "categories_update"
  ON categories FOR UPDATE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- RLS Policy: Users can delete/archive categories in their household
CREATE POLICY "categories_delete"
  ON categories FOR DELETE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Comment on policies
COMMENT ON POLICY "categories_select" ON categories IS 'Users can view categories in their household';
COMMENT ON POLICY "categories_insert" ON categories IS 'Users can create categories in their household';
COMMENT ON POLICY "categories_update" ON categories IS 'Users can update categories in their household';
COMMENT ON POLICY "categories_delete" ON categories IS 'Users can delete categories in their household (soft delete recommended)';

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_categories_updated_at() IS 'Automatically updates the updated_at timestamp on row modification';

CREATE TRIGGER categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION update_categories_updated_at();

COMMENT ON TRIGGER categories_updated_at ON categories IS 'Ensures updated_at is automatically set on every UPDATE';

COMMIT;

-- Rollback instructions:
-- To rollback this migration, run:
-- BEGIN;
-- DROP TRIGGER IF EXISTS categories_updated_at ON categories;
-- DROP FUNCTION IF EXISTS update_categories_updated_at();
-- DROP POLICY IF EXISTS "categories_delete" ON categories;
-- DROP POLICY IF EXISTS "categories_update" ON categories;
-- DROP POLICY IF EXISTS "categories_insert" ON categories;
-- DROP POLICY IF EXISTS "categories_select" ON categories;
-- DROP INDEX IF EXISTS idx_categories_sort;
-- DROP INDEX IF EXISTS idx_categories_household;
-- DROP INDEX IF EXISTS idx_categories_active;
-- DROP INDEX IF EXISTS idx_categories_parent;
-- DROP TABLE IF EXISTS categories CASCADE;
-- COMMIT;
