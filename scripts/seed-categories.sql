-- Seed initial categories for Household Hub
-- Run this in Supabase SQL Editor
-- Note: household_id will use the database default value

-- Parent: Food
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Food', NULL, '#EF4444', 'utensils', 1);

-- Get the Food parent id
WITH food_parent AS (
  SELECT id FROM categories WHERE name = 'Food' AND parent_id IS NULL
)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Groceries', id, '#EF4444', 'shopping-cart', 1 FROM food_parent
UNION ALL
SELECT 'Dining Out', id, '#EF4444', 'coffee', 2 FROM food_parent
UNION ALL
SELECT 'Snacks', id, '#EF4444', 'gift', 3 FROM food_parent;

-- Parent: Transportation
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Transportation', NULL, '#3B82F6', 'car', 2);

WITH transport_parent AS (
  SELECT id FROM categories WHERE name = 'Transportation' AND parent_id IS NULL
)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Gas', id, '#3B82F6', 'zap', 1 FROM transport_parent
UNION ALL
SELECT 'Public Transit', id, '#3B82F6', 'car', 2 FROM transport_parent
UNION ALL
SELECT 'Parking', id, '#3B82F6', 'home', 3 FROM transport_parent;

-- Parent: Utilities
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Utilities', NULL, '#10B981', 'zap', 3);

WITH utilities_parent AS (
  SELECT id FROM categories WHERE name = 'Utilities' AND parent_id IS NULL
)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Electricity', id, '#10B981', 'zap', 1 FROM utilities_parent
UNION ALL
SELECT 'Water', id, '#10B981', 'home', 2 FROM utilities_parent
UNION ALL
SELECT 'Internet', id, '#10B981', 'smartphone', 3 FROM utilities_parent;

-- Parent: Entertainment
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Entertainment', NULL, '#8B5CF6', 'tv', 4);

WITH entertainment_parent AS (
  SELECT id FROM categories WHERE name = 'Entertainment' AND parent_id IS NULL
)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Movies', id, '#8B5CF6', 'tv', 1 FROM entertainment_parent
UNION ALL
SELECT 'Games', id, '#8B5CF6', 'gift', 2 FROM entertainment_parent
UNION ALL
SELECT 'Subscriptions', id, '#8B5CF6', 'smartphone', 3 FROM entertainment_parent;
