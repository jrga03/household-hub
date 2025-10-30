# Checkpoint: Budgets Basic

Verify the complete budget system works correctly.

---

## 0. Database Prerequisites ✓

**Before testing the UI, verify the database is ready:**

### Check Budgets Table Schema

Open Supabase SQL Editor and run:

```sql
-- Verify budgets table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'budgets'
ORDER BY ordinal_position;
```

**Expected columns:**

- id (uuid)
- household_id (uuid)
- category_id (uuid)
- month (date)
- month_key (integer, generated)
- amount_cents (bigint)
- currency_code (text)
- created_at (timestamp with time zone)
- updated_at (timestamp with time zone)

### Check Required Indexes

```sql
-- Verify performance indexes exist
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('budgets', 'transactions')
AND indexname IN (
  'idx_budgets_household_month',
  'idx_budgets_month_key',
  'idx_transactions_category_date',
  'idx_transactions_month'
)
ORDER BY tablename, indexname;
```

**Expected:** All 4 indexes present

### Check Unique Constraint

```sql
-- Verify unique constraint on (household_id, category_id, month)
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'budgets'::regclass
AND contype = 'u';
```

**Expected:** Unique constraint on `(household_id, category_id, month)`

**Check**:

- [ ] Budgets table exists with correct schema
- [ ] month_key computed column present
- [ ] All 4 required indexes exist
- [ ] Unique constraint enforced
- [ ] No database errors

**If any checks fail:** Review `DATABASE.md` lines 265-294 and create missing migrations.

---

## 1. Page Loads ✓

Visit `http://localhost:3000/budgets`

**Check**:

- [ ] Page loads without errors
- [ ] Month selector displays
- [ ] "Add Budget" button visible
- [ ] "Copy Previous Month" button visible
- [ ] No console errors

---

## 2. Create Budget ✓

**Test Case**:

1. Click "Add Budget"
2. Select category "Groceries"
3. Enter amount "5,000"
4. Click "Create"

**Expected**:

- Budget created successfully
- Toast notification shows
- Budget appears in list
- Progress bar shows 0% (no spending yet)

**Check**:

- [ ] Form opens when clicking Add Budget
- [ ] Category selector works (child categories only)
- [ ] Amount input accepts valid PHP amounts
- [ ] Budget saves to database
- [ ] Budget appears in list immediately

---

## 3. Budget vs Actual Calculation ✓

**Setup**:

1. Create budget: Groceries = ₱5,000
2. Add transaction: Groceries expense ₱3,000

**Expected Budget Display**:

- Budget Amount: ₱5,000.00
- Spent: ₱3,000.00
- Remaining: ₱2,000.00
- Percent Used: 60.0%
- Progress bar: 60% filled (green)

**Check**:

- [ ] Spent amount matches transaction total
- [ ] Remaining calculated correctly
- [ ] Percentage accurate
- [ ] Progress bar reflects percentage

---

## 4. Transfer Exclusion Works ✓

**CRITICAL TEST**: Transfers MUST NOT count toward budget

**Setup**:

1. Create budget: Food = ₱5,000
2. Add expense: Food ₱2,000 (regular transaction)
3. Create transfer: ₱3,000 from Checking → Savings (has transfer_group_id)

**Expected**:

- Spent: ₱2,000.00 (only the regular expense)
- Transfer NOT counted
- Percent Used: 40.0% (2000/5000)

**Check**:

- [ ] Only real expenses counted
- [ ] Transfers excluded from spent amount
- [ ] Budget math correct

---

## 5. Edit Budget ✓

**Test Case**:

1. Click edit (pencil icon) on existing budget
2. Change amount from ₱5,000 to ₱6,000
3. Click "Update"

**Expected**:

- Form opens with current values
- Amount field pre-filled
- Category field disabled (can't change)
- Update saves successfully
- Progress recalculates (e.g., 50% → ~33.3%)

**Check**:

- [ ] Edit button opens form
- [ ] Form shows existing values
- [ ] Can't change category
- [ ] Amount updates correctly
- [ ] Progress bar updates

---

## 6. Delete Budget ✓

**Test Case**:

1. Click delete (trash icon) on budget
2. Confirm deletion

**Expected**:

- Confirmation dialog appears
- Budget deleted from database
- Budget removed from list
- Toast notification shows

**Check**:

- [ ] Delete button works
- [ ] Confirmation required
- [ ] Budget deleted successfully
- [ ] UI updates immediately

---

## 7. Progress Bar Colors ✓

**Test Different Scenarios**:

**Under Budget (< 80%)**:

- Spent: ₱3,000 of ₱5,000
- Expected: Green progress bar

**Approaching Limit (80-100%)**:

- Spent: ₱4,500 of ₱5,000 (90%)
- Expected: Yellow progress bar
- Warning text color

**Over Budget (> 100%)**:

- Spent: ₱6,000 of ₱5,000 (120%)
- Expected: Red progress bar
- Over budget warning message
- Shows amount over

**Check**:

- [ ] Green when under 80%
- [ ] Yellow when 80-100%
- [ ] Red when over 100%
- [ ] Warning message when over budget

---

## 8. Copy Previous Month ✓

**Test Case 1: Copy budgets**

1. Create budgets for January
2. Navigate to February
3. Click "Copy Previous Month"

**Expected**:

- Budgets from January copied to February
- Same categories and amounts
- Toast shows count copied
- Button disabled after copy

**Test Case 2: Button disabled when budgets exist**

1. Month already has budgets
2. **Expected**:
   - "Copy Previous Month" button disabled
   - Can't accidentally duplicate

**Check**:

- [ ] Copy function works
- [ ] Correct month range
- [ ] Same amounts copied
- [ ] Button disabled when budgets exist
- [ ] Toast notification shows count

---

## 9. Parent Category Grouping ✓

**Setup**: Create budgets for multiple categories:

- Groceries (Food parent): ₱5,000
- Dining (Food parent): ₱3,000
- Gas (Transportation parent): ₱2,000

**Expected Display**:

```
Food
  ├─ Groceries: ₱5,000
  └─ Dining: ₱3,000
Transportation
  └─ Gas: ₱2,000
```

**Check**:

- [ ] Budgets grouped by parent category
- [ ] Parent header shows name and color
- [ ] Parent shows total budget and spent
- [ ] Children displayed under parent
- [ ] Proper visual hierarchy

---

## 10. Unique Constraint Handling ✓

**Test Case**: Try to create duplicate budget

1. Create budget: Groceries = ₱5,000
2. Try to create another budget: Groceries = ₱6,000 (same month)

**Expected**:

- Error message shown
- Budget not created
- Inform user budget already exists

**Check**:

- [ ] Duplicate detection works
- [ ] Error message displayed
- [ ] No duplicate budgets created

---

## 11. Month Navigation ✓

**Test Case**:

1. Create budgets for January
2. Navigate to February (no budgets)
3. Navigate back to January

**Expected**:

- January: Shows created budgets
- February: Empty state
- January again: Budgets still there

**Check**:

- [ ] Budgets load for correct month
- [ ] Empty state when no budgets
- [ ] Month changes update query
- [ ] Data persists across navigation

---

## 12. Empty State ✓

**Test Case**: Month with no budgets

**Expected**:

- "No budgets for this month" message
- Suggestion to add budget
- Add Budget button still visible
- Copy Previous Month button enabled

**Check**:

- [ ] Empty state displays
- [ ] Helpful message shown
- [ ] Action buttons available

---

## 13. Loading State ✓

**Test Case**:

1. Throttle network
2. Navigate to budgets page

**Expected**:

- Loading spinner displays
- Centered on page
- Clean transition when loaded

**Check**:

- [ ] Loading spinner shows
- [ ] No layout shift
- [ ] Smooth transition

---

## 14. Amount Validation ✓

**Test Invalid Amounts**:

**Too low**:

- Enter: "0"
- Expected: Error message

**Too high**:

- Enter: "10,000,000" (exceeds max)
- Expected: Error message

**Invalid format**:

- Enter: "abc"
- Expected: Error message

**Check**:

- [ ] Zero rejected
- [ ] Maximum enforced
- [ ] Invalid formats handled
- [ ] Error messages clear

---

## 15. Multiple Budgets Management ✓

**Test Case**: Create 10+ budgets

**Expected**:

- All budgets displayed
- Grouped by parent category
- Performance smooth
- No lag or freezing

**Check**:

- [ ] Handles many budgets
- [ ] UI remains responsive
- [ ] All budgets visible
- [ ] Scrolling smooth

---

## 16. Real-Time Updates ✓

**Test Case**:

1. Note budget progress (e.g., 60%)
2. Add expense transaction in that category
3. Return to budgets page

**Expected**:

- Spent amount updated
- Progress bar adjusted
- Remaining recalculated
- Color may change

**Check**:

- [ ] Budgets update after transactions
- [ ] Cache invalidation works
- [ ] No manual refresh needed

---

## 17. Currency Formatting ✓

**Check All Amounts**:

- [ ] Budget amount: ₱5,000.00
- [ ] Spent amount: ₱3,000.00
- [ ] Remaining: ₱2,000.00
- [ ] All use formatPHP
- [ ] Thousands separators
- [ ] Two decimal places

---

## 18. Form Validation ✓

**Test Required Fields**:

1. Try to submit without category
2. Try to submit without amount

**Expected**:

- Validation errors shown
- Form not submitted
- Error messages clear

**Check**:

- [ ] Category required
- [ ] Amount required
- [ ] Validation messages display
- [ ] Form doesn't submit until valid

---

## 19. Category Selector (Child Only) ✓

**Test Category Selection**:

1. Open category dropdown
2. **Expected**:
   - Parent categories shown as labels (not selectable)
   - Child categories selectable
   - Grouped under parents

**Check**:

- [ ] Only child categories selectable
- [ ] Parents shown as labels
- [ ] Hierarchy clear
- [ ] Color indicators visible

---

## 20. Percentage Display ✓

**Test Accuracy**:

- Budget: ₱5,000
- Spent: ₱3,750
- Expected: 75.0%

**Check**:

- [ ] Percentage calculated correctly
- [ ] Displayed to 1 decimal place
- [ ] Updates with spending
- [ ] Shown in progress bar and text

---

## Success Criteria

- [ ] Budget CRUD operations work
- [ ] Transfers EXCLUDED from actual spending
- [ ] Budget vs actual calculation accurate
- [ ] Progress bars show correct state/color
- [ ] Copy previous month works
- [ ] Parent category grouping correct
- [ ] Unique constraint enforced
- [ ] Month navigation functional
- [ ] Form validation working
- [ ] Only child categories allowed
- [ ] Real-time updates functional
- [ ] Loading and empty states handled
- [ ] No console errors
- [ ] **Budgets are production-ready!**
- [ ] **MVP COMPLETE!** 🎉

---

## Next Steps

Once verified:

1. Commit budget code
2. **Run full MVP verification**
3. Test complete user workflows
4. **Move to production deployment planning!**

---

**Congratulations! This is the final MVP chunk!**

**Time**: 25-35 minutes to verify all checkpoints
