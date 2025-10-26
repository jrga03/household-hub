-- ⚠️ IMPORTANT: This seed script requires manual user UUID replacement
-- Step 1: Get your user ID by running: SELECT id FROM auth.users LIMIT 1;
-- Step 2: Replace 'YOUR-USER-UUID-HERE' below with your actual UUID
-- Step 3: Run this entire script in Supabase SQL Editor

-- Seed data for Household Hub transactions with realistic Philippine Peso amounts
-- Features:
--   - 20+ transactions spanning 30 days
--   - Mix of income/expense types
--   - Variety of categories (groceries, dining, utilities, etc.)
--   - 2-3 pending transactions
--   - 1 transfer pair (checking → savings)
--   - Realistic PHP amounts with centavo precision

BEGIN;

-- ========================================
-- SEED DATA PREPARATION
-- ========================================
-- Lookup IDs for accounts and categories to use in transactions
WITH seed_data AS (
  SELECT
    -- User ID (REPLACE THIS!)
    '3f3e47d5-f6b0-4e96-bd14-9451b119bccc'::uuid as user_id,

    -- Default household ID
    '00000000-0000-0000-0000-000000000001'::uuid as household_id,

    -- Account IDs (assumes accounts exist - create them first if needed)
    (SELECT id FROM accounts WHERE name LIKE '%Checking%' OR name LIKE '%BPI%' ORDER BY created_at LIMIT 1) as checking_id,
    (SELECT id FROM accounts WHERE name LIKE '%Savings%' OR name LIKE '%Save%' ORDER BY created_at LIMIT 1) as savings_id,
    (SELECT id FROM accounts WHERE name LIKE '%Cash%' ORDER BY created_at LIMIT 1) as cash_id,
    (SELECT id FROM accounts WHERE name LIKE '%Credit%' OR name LIKE '%CC%' ORDER BY created_at LIMIT 1) as credit_card_id,

    -- Category IDs (from custom seed categories)
    (SELECT id FROM categories WHERE name = 'Gasul & Bigas' LIMIT 1) as groceries_id,
    (SELECT id FROM categories WHERE name = 'Coffee Allowance' LIMIT 1) as dining_id,
    (SELECT id FROM categories WHERE name = 'Car Gas' LIMIT 1) as gas_id,
    (SELECT id FROM categories WHERE name = 'Electricity & Water' LIMIT 1) as electricity_id,
    (SELECT id FROM categories WHERE name = 'Internet' LIMIT 1) as internet_id,
    (SELECT id FROM categories WHERE name = 'Helper' LIMIT 1) as helper_id,
    (SELECT id FROM categories WHERE name = 'Medical' LIMIT 1) as medical_id,
    (SELECT id FROM categories WHERE name = 'Subscriptions' LIMIT 1) as subscriptions_id,
    (SELECT id FROM categories WHERE name = 'Gifts' LIMIT 1) as gifts_id,
    (SELECT id FROM categories WHERE name = 'Ellie Tuition' LIMIT 1) as tuition_id,
    (SELECT id FROM categories WHERE name = 'Just Savings' LIMIT 1) as salary_category_id,
    (SELECT id FROM categories WHERE name = 'Bonuses' LIMIT 1) as bonus_category_id,

    -- Transfer group ID for transfer pair
    gen_random_uuid() as transfer_group_id
)

-- ========================================
-- INSERT TRANSACTIONS
-- ========================================
INSERT INTO transactions (
  household_id,
  date,
  description,
  amount_cents,
  type,
  account_id,
  category_id,
  status,
  visibility,
  created_by_user_id,
  transfer_group_id,
  notes,
  created_at,
  updated_at
)
SELECT * FROM (VALUES
  -- ========================================
  -- INCOME TRANSACTIONS (2 total)
  -- ========================================

  -- 1. Salary deposit (most recent)
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '2 days',
    'Salary - Jason',
    5000000, -- ₱50,000.00
    'income',
    (SELECT checking_id FROM seed_data),
    (SELECT salary_category_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Monthly salary deposit',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  ),

  -- 2. Freelance income
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '15 days',
    'Freelance Project - Web Design',
    1500000, -- ₱15,000.00
    'income',
    (SELECT checking_id FROM seed_data),
    (SELECT bonus_category_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Client: ABC Corporation',
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '15 days'
  ),

  -- ========================================
  -- EXPENSE TRANSACTIONS (18+ total)
  -- ========================================

  -- 3. Groceries #1 (today - PENDING)
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE,
    'SM Supermarket',
    25000, -- ₱250.00
    'expense',
    (SELECT cash_id FROM seed_data),
    (SELECT groceries_id FROM seed_data),
    'pending',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Weekly grocery shopping',
    NOW(),
    NOW()
  ),

  -- 4. Coffee shop (yesterday - PENDING)
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '1 day',
    'Starbucks',
    18500, -- ₱185.00
    'expense',
    (SELECT credit_card_id FROM seed_data),
    (SELECT dining_id FROM seed_data),
    'pending',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Morning coffee',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day'
  ),

  -- 5. Groceries #2
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '3 days',
    'Puregold',
    32000, -- ₱320.00
    'expense',
    (SELECT checking_id FROM seed_data),
    (SELECT groceries_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Bigas and pantry items',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days'
  ),

  -- 6. Gas fillup
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '4 days',
    'Shell Gas Station',
    180000, -- ₱1,800.00
    'expense',
    (SELECT credit_card_id FROM seed_data),
    (SELECT gas_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Full tank',
    NOW() - INTERVAL '4 days',
    NOW() - INTERVAL '4 days'
  ),

  -- 7. Restaurant dinner
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '5 days',
    'Jollibee',
    45000, -- ₱450.00
    'expense',
    (SELECT cash_id FROM seed_data),
    (SELECT dining_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Family dinner',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days'
  ),

  -- 8. Electricity bill (Meralco)
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '7 days',
    'Meralco - October 2025',
    450000, -- ₱4,500.00
    'expense',
    (SELECT checking_id FROM seed_data),
    (SELECT electricity_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Monthly electricity bill',
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '7 days'
  ),

  -- 9. Internet bill (PLDT)
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '8 days',
    'PLDT Fiber',
    149900, -- ₱1,499.00
    'expense',
    (SELECT checking_id FROM seed_data),
    (SELECT internet_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Monthly internet subscription',
    NOW() - INTERVAL '8 days',
    NOW() - INTERVAL '8 days'
  ),

  -- 10. Groceries #3
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '10 days',
    'SM Supermarket',
    28000, -- ₱280.00
    'expense',
    (SELECT checking_id FROM seed_data),
    (SELECT groceries_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Fresh produce and snacks',
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '10 days'
  ),

  -- 11. Fast food lunch
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '11 days',
    'McDonald''s',
    12500, -- ₱125.00
    'expense',
    (SELECT cash_id FROM seed_data),
    (SELECT dining_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Quick lunch',
    NOW() - INTERVAL '11 days',
    NOW() - INTERVAL '11 days'
  ),

  -- 12. Helper salary
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '12 days',
    'Helper Salary - October',
    600000, -- ₱6,000.00
    'expense',
    (SELECT checking_id FROM seed_data),
    (SELECT helper_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Monthly helper compensation',
    NOW() - INTERVAL '12 days',
    NOW() - INTERVAL '12 days'
  ),

  -- 13. Pharmacy
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '14 days',
    'Mercury Drug',
    38500, -- ₱385.00
    'expense',
    (SELECT cash_id FROM seed_data),
    (SELECT medical_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Vitamins and medicine',
    NOW() - INTERVAL '14 days',
    NOW() - INTERVAL '14 days'
  ),

  -- 14. Groceries #4
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '17 days',
    'Puregold',
    31500, -- ₱315.00
    'expense',
    (SELECT checking_id FROM seed_data),
    (SELECT groceries_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Weekly groceries',
    NOW() - INTERVAL '17 days',
    NOW() - INTERVAL '17 days'
  ),

  -- 15. Gas fillup #2
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '18 days',
    'Petron Gas Station',
    190000, -- ₱1,900.00
    'expense',
    (SELECT credit_card_id FROM seed_data),
    (SELECT gas_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Full tank',
    NOW() - INTERVAL '18 days',
    NOW() - INTERVAL '18 days'
  ),

  -- 16. Netflix subscription
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '19 days',
    'Netflix Premium',
    54900, -- ₱549.00
    'expense',
    (SELECT credit_card_id FROM seed_data),
    (SELECT subscriptions_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Monthly streaming subscription',
    NOW() - INTERVAL '19 days',
    NOW() - INTERVAL '19 days'
  ),

  -- 17. Coffee shop #2
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '20 days',
    'The Coffee Bean',
    17500, -- ₱175.00
    'expense',
    (SELECT cash_id FROM seed_data),
    (SELECT dining_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Afternoon coffee',
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '20 days'
  ),

  -- 18. Groceries #5
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '24 days',
    'SM Hypermarket',
    35000, -- ₱350.00
    'expense',
    (SELECT checking_id FROM seed_data),
    (SELECT groceries_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Bulk pantry items',
    NOW() - INTERVAL '24 days',
    NOW() - INTERVAL '24 days'
  ),

  -- 19. Birthday gift
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '25 days',
    'Toy Kingdom',
    120000, -- ₱1,200.00
    'expense',
    (SELECT credit_card_id FROM seed_data),
    (SELECT gifts_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Birthday present for Ellie',
    NOW() - INTERVAL '25 days',
    NOW() - INTERVAL '25 days'
  ),

  -- 20. Tuition payment
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '28 days',
    'Ellie School - Quarterly Tuition',
    2500000, -- ₱25,000.00
    'expense',
    (SELECT checking_id FROM seed_data),
    (SELECT tuition_id FROM seed_data),
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    NULL,
    'Q4 2025 tuition payment',
    NOW() - INTERVAL '28 days',
    NOW() - INTERVAL '28 days'
  ),

  -- ========================================
  -- TRANSFER PAIR (2 transactions)
  -- ========================================
  -- Transfer ₱10,000 from Checking to Savings

  -- 21. Transfer OUT (expense from checking)
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '6 days',
    'Transfer to Savings',
    1000000, -- ₱10,000.00
    'expense',
    (SELECT checking_id FROM seed_data),
    NULL, -- Transfers don't have categories
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    (SELECT transfer_group_id FROM seed_data), -- CRITICAL: Links the pair
    'Monthly savings allocation',
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '6 days'
  ),

  -- 22. Transfer IN (income to savings)
  (
    (SELECT household_id FROM seed_data),
    CURRENT_DATE - INTERVAL '6 days',
    'Transfer from Checking',
    1000000, -- ₱10,000.00 (SAME AMOUNT)
    'income',
    (SELECT savings_id FROM seed_data),
    NULL, -- Transfers don't have categories
    'cleared',
    'household',
    (SELECT user_id FROM seed_data),
    (SELECT transfer_group_id FROM seed_data), -- CRITICAL: Same transfer_group_id
    'Monthly savings allocation',
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '6 days'
  )

) AS t(
  household_id,
  date,
  description,
  amount_cents,
  type,
  account_id,
  category_id,
  status,
  visibility,
  created_by_user_id,
  transfer_group_id,
  notes,
  created_at,
  updated_at
);

COMMIT;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================
-- Run these to verify the seed data was inserted correctly

-- 1. Total transaction count (should be 22)
SELECT COUNT(*) as total_transactions FROM transactions;

-- 2. Count by type (should show: 2 income, 20 expense)
SELECT type, COUNT(*) as count
FROM transactions
GROUP BY type
ORDER BY type;

-- 3. Count by status (should show: ~19 cleared, 2-3 pending)
SELECT status, COUNT(*) as count
FROM transactions
GROUP BY status
ORDER BY status;

-- 4. Verify transfer pair (should show 1 row with matching amounts)
SELECT
  t1.date,
  t1.description as from_desc,
  t1.type as from_type,
  t1.amount_cents as from_amount,
  t2.description as to_desc,
  t2.type as to_type,
  t2.amount_cents as to_amount,
  t1.transfer_group_id,
  CASE
    WHEN t1.amount_cents = t2.amount_cents THEN '✓ Amounts match'
    ELSE '✗ MISMATCH!'
  END as validation
FROM transactions t1
JOIN transactions t2 ON t1.transfer_group_id = t2.transfer_group_id AND t1.id != t2.id
WHERE t1.transfer_group_id IS NOT NULL
  AND t1.type = 'expense'; -- Show from expense side

-- 5. Income vs Expense totals (EXCLUDING transfers)
SELECT
  SUM(CASE WHEN type = 'income' AND transfer_group_id IS NULL THEN amount_cents ELSE 0 END) / 100.0 as total_income_php,
  SUM(CASE WHEN type = 'expense' AND transfer_group_id IS NULL THEN amount_cents ELSE 0 END) / 100.0 as total_expense_php,
  (SUM(CASE WHEN type = 'income' AND transfer_group_id IS NULL THEN amount_cents ELSE 0 END) -
   SUM(CASE WHEN type = 'expense' AND transfer_group_id IS NULL THEN amount_cents ELSE 0 END)) / 100.0 as net_php
FROM transactions;

-- 6. Transactions by category (top 5)
SELECT
  c.name as category,
  COUNT(t.id) as transaction_count,
  SUM(t.amount_cents) / 100.0 as total_php
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
WHERE t.transfer_group_id IS NULL -- CRITICAL: Exclude transfers from analytics
GROUP BY c.name
ORDER BY SUM(t.amount_cents) DESC
LIMIT 5;

-- 7. Recent transactions (last 7 days)
SELECT
  date,
  description,
  type,
  amount_cents / 100.0 as amount_php,
  status,
  CASE WHEN transfer_group_id IS NOT NULL THEN 'TRANSFER' ELSE 'REGULAR' END as transaction_type
FROM transactions
ORDER BY date DESC, created_at DESC
LIMIT 10;

-- ========================================
-- NOTES
-- ========================================
-- 1. All amounts are stored as BIGINT cents (1 PHP = 100 cents)
-- 2. Transfer transactions have transfer_group_id set (exactly 2 per group)
-- 3. Transfers have NO category_id (NULL)
-- 4. When calculating income/expense analytics, ALWAYS exclude transfers:
--    WHERE transfer_group_id IS NULL
-- 5. Account balances INCLUDE transfers (they affect balances)
-- 6. Budget calculations MUST EXCLUDE transfers
