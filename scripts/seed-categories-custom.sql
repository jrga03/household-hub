-- Custom seed script for Household Hub categories
-- Based on actual data from Savings_Expenses spreadsheet
-- 8 parent categories with 69 total subcategories

-- Clear existing categories (CASCADE will delete children automatically)
DELETE FROM categories WHERE household_id = '00000000-0000-0000-0000-000000000001';

-- Parent 1: Savings (Green - #10B981)
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Savings', NULL, '#10B981', 'piggy-bank', 1);

WITH savings_parent AS (SELECT id FROM categories WHERE name = 'Savings' AND parent_id IS NULL)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Maintaining Balance', id, '#10B981', 'wallet', 1 FROM savings_parent UNION ALL
SELECT 'Forever House', id, '#10B981', 'home', 2 FROM savings_parent UNION ALL
SELECT 'Just Savings', id, '#10B981', 'piggy-bank', 3 FROM savings_parent UNION ALL
SELECT 'Retirement', id, '#10B981', 'briefcase', 4 FROM savings_parent UNION ALL
SELECT 'Big Ticket Items', id, '#10B981', 'shopping-cart', 5 FROM savings_parent UNION ALL
SELECT 'Fun Spending', id, '#10B981', 'gift', 6 FROM savings_parent UNION ALL
SELECT 'Child Future', id, '#10B981', 'heart', 7 FROM savings_parent UNION ALL
SELECT 'Ellie Money', id, '#10B981', 'heart', 8 FROM savings_parent UNION ALL
SELECT 'Gabby Money', id, '#10B981', 'heart', 9 FROM savings_parent UNION ALL
SELECT 'Bonuses', id, '#10B981', 'zap', 10 FROM savings_parent UNION ALL
SELECT 'Excess - Jason Sweldo', id, '#10B981', 'wallet', 11 FROM savings_parent UNION ALL
SELECT 'Excess - Iel Sweldo', id, '#10B981', 'wallet', 12 FROM savings_parent UNION ALL
SELECT 'Gala funds', id, '#10B981', 'gift', 13 FROM savings_parent;

-- Parent 2: Investments (Purple - #8B5CF6)
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Investments', NULL, '#8B5CF6', 'trending-up', 2);

WITH investments_parent AS (SELECT id FROM categories WHERE name = 'Investments' AND parent_id IS NULL)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Sunlife - Iel', id, '#8B5CF6', 'trending-up', 1 FROM investments_parent UNION ALL
SELECT 'Sunlife - Ellie', id, '#8B5CF6', 'trending-up', 2 FROM investments_parent UNION ALL
SELECT 'BPI Philam - Jason', id, '#8B5CF6', 'trending-up', 3 FROM investments_parent UNION ALL
SELECT 'Prulife Ellie', id, '#8B5CF6', 'trending-up', 4 FROM investments_parent;

-- Parent 3: Long-term Payments (Blue - #3B82F6)
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Long-term Payments', NULL, '#3B82F6', 'calendar', 3);

WITH longterm_parent AS (SELECT id FROM categories WHERE name = 'Long-term Payments' AND parent_id IS NULL)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Ellie Tuition', id, '#3B82F6', 'book', 1 FROM longterm_parent UNION ALL
SELECT 'House Payment', id, '#3B82F6', 'home', 2 FROM longterm_parent UNION ALL
SELECT 'Car Payment', id, '#3B82F6', 'car', 3 FROM longterm_parent UNION ALL
SELECT 'House Renovation Debt', id, '#3B82F6', 'home', 4 FROM longterm_parent UNION ALL
SELECT 'Emergency Fund', id, '#3B82F6', 'shield', 5 FROM longterm_parent;

-- Parent 4: Living Expenses (Amber - #F59E0B)
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Living Expenses', NULL, '#F59E0B', 'shopping-bag', 4);

WITH living_parent AS (SELECT id FROM categories WHERE name = 'Living Expenses' AND parent_id IS NULL)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Revolving Funds', id, '#F59E0B', 'refresh-cw', 1 FROM living_parent UNION ALL
SELECT 'Ellie Essentials', id, '#F59E0B', 'heart', 2 FROM living_parent UNION ALL
SELECT 'Ellie Growing-up stuff', id, '#F59E0B', 'heart', 3 FROM living_parent UNION ALL
SELECT 'Child Essentials', id, '#F59E0B', 'baby', 4 FROM living_parent UNION ALL
SELECT 'Gabby Essentials', id, '#F59E0B', 'heart', 5 FROM living_parent UNION ALL
SELECT 'Gabby Growing-up Stuff', id, '#F59E0B', 'heart', 6 FROM living_parent UNION ALL
SELECT 'Gasul & Bigas', id, '#F59E0B', 'utensils', 7 FROM living_parent UNION ALL
SELECT 'Car Gas', id, '#F59E0B', 'fuel', 8 FROM living_parent UNION ALL
SELECT 'Coffee Allowance', id, '#F59E0B', 'coffee', 9 FROM living_parent UNION ALL
SELECT 'Comm Allowance', id, '#F59E0B', 'smartphone', 10 FROM living_parent UNION ALL
SELECT 'Baby #2', id, '#F59E0B', 'baby', 11 FROM living_parent;

-- Parent 5: Recurring Expenses (Red - #EF4444)
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Recurring Expenses', NULL, '#EF4444', 'repeat', 5);

WITH recurring_parent AS (SELECT id FROM categories WHERE name = 'Recurring Expenses' AND parent_id IS NULL)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Helper', id, '#EF4444', 'user', 1 FROM recurring_parent UNION ALL
SELECT 'Internet', id, '#EF4444', 'wifi', 2 FROM recurring_parent UNION ALL
SELECT 'Electricity & Water', id, '#EF4444', 'zap', 3 FROM recurring_parent UNION ALL
SELECT 'CC Installments', id, '#EF4444', 'credit-card', 4 FROM recurring_parent UNION ALL
SELECT 'House Stuff', id, '#EF4444', 'home', 5 FROM recurring_parent UNION ALL
SELECT 'Gym Membership', id, '#EF4444', 'dumbbell', 6 FROM recurring_parent UNION ALL
SELECT 'Clothing Allowance', id, '#EF4444', 'shopping-bag', 7 FROM recurring_parent UNION ALL
SELECT 'Subscriptions', id, '#EF4444', 'repeat', 8 FROM recurring_parent UNION ALL
SELECT 'Buffer', id, '#EF4444', 'shield', 9 FROM recurring_parent UNION ALL
SELECT 'Gifts', id, '#EF4444', 'gift', 10 FROM recurring_parent UNION ALL
SELECT 'Bea Allowance', id, '#EF4444', 'user', 11 FROM recurring_parent UNION ALL
SELECT 'Iel Parents', id, '#EF4444', 'users', 12 FROM recurring_parent UNION ALL
SELECT 'Medical', id, '#EF4444', 'heart-pulse', 13 FROM recurring_parent UNION ALL
SELECT 'Health and Fitness', id, '#EF4444', 'activity', 14 FROM recurring_parent UNION ALL
SELECT 'BPI AIA', id, '#EF4444', 'file-text', 15 FROM recurring_parent UNION ALL
SELECT 'Dentist', id, '#EF4444', 'smile', 16 FROM recurring_parent UNION ALL
SELECT 'Vaccine', id, '#EF4444', 'syringe', 17 FROM recurring_parent UNION ALL
SELECT 'Skincare', id, '#EF4444', 'sparkles', 18 FROM recurring_parent UNION ALL
SELECT 'Ellie Extra Curricular', id, '#EF4444', 'book', 19 FROM recurring_parent;

-- Parent 6: Annual Expenses (Teal - #14B8A6)
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Annual Expenses', NULL, '#14B8A6', 'calendar-days', 6);

WITH annual_parent AS (SELECT id FROM categories WHERE name = 'Annual Expenses' AND parent_id IS NULL)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Amilyar', id, '#14B8A6', 'file-text', 1 FROM annual_parent UNION ALL
SELECT 'Philhealth', id, '#14B8A6', 'heart-pulse', 2 FROM annual_parent UNION ALL
SELECT 'SSS', id, '#14B8A6', 'file-text', 3 FROM annual_parent UNION ALL
SELECT 'BIR', id, '#14B8A6', 'file-text', 4 FROM annual_parent UNION ALL
SELECT 'Car Registration', id, '#14B8A6', 'car', 5 FROM annual_parent UNION ALL
SELECT 'Taxumo', id, '#14B8A6', 'file-text', 6 FROM annual_parent UNION ALL
SELECT 'Car Maintenance', id, '#14B8A6', 'wrench', 7 FROM annual_parent UNION ALL
SELECT 'HOA', id, '#14B8A6', 'home', 8 FROM annual_parent UNION ALL
SELECT 'HMO', id, '#14B8A6', 'heart-pulse', 9 FROM annual_parent UNION ALL
SELECT 'Aircon Maintenance', id, '#14B8A6', 'wind', 10 FROM annual_parent;

-- Parent 7: Temporary Expense (Pink - #EC4899)
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Temporary Expense', NULL, '#EC4899', 'clock', 7);

WITH temp_parent AS (SELECT id FROM categories WHERE name = 'Temporary Expense' AND parent_id IS NULL)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Maternity', id, '#EC4899', 'baby', 1 FROM temp_parent UNION ALL
SELECT 'Japan Trip', id, '#EC4899', 'plane', 2 FROM temp_parent;

-- Parent 8: Non-budget Expense (Gray - #6B7280)
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Non-budget Expense', NULL, '#6B7280', 'help-circle', 8);

WITH nonbudget_parent AS (SELECT id FROM categories WHERE name = 'Non-budget Expense' AND parent_id IS NULL)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Jason', id, '#6B7280', 'user', 1 FROM nonbudget_parent UNION ALL
SELECT 'Iel', id, '#6B7280', 'user', 2 FROM nonbudget_parent UNION ALL
SELECT 'Others', id, '#6B7280', 'help-circle', 3 FROM nonbudget_parent;
