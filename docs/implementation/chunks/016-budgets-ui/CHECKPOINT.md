# Checkpoint: Budgets UI

Run these verifications to ensure everything works correctly.

---

## 1. Components Render ✓

```bash
npm run dev
```

Visit `http://localhost:3000/budgets`

**Expected**:

- Budgets page loads without errors
- Month selector shows current month
- Navigation buttons (previous/next month) visible
- "No Budgets Set" card if no budgets exist

---

## 2. Create Budget Flow ✓

**Steps**:

1. Click "Add Budget" button
2. Dialog opens with budget form
3. Select a category from dropdown
4. Enter amount (e.g., "5000" for ₱5,000.00)
5. Click "Create Budget"

**Expected**:

- Form submits successfully
- Toast shows "Budget created successfully"
- Dialog closes
- New budget appears in list with progress bar
- Progress bar shows 0% (no spending yet)

---

## 3. Budget Progress Display ✓

After creating a budget:

**Check display**:

- [ ] Category name shown
- [ ] Progress bar visible
- [ ] Percentage badge (should show 0%)
- [ ] "₱X of ₱Y" format correct
- [ ] "₱Y remaining" text shown

**Colors**:

- 0% spent: Green progress bar, green badge
- Create some transactions to test other states

---

## 4. Budget vs Actual Calculation ✓

**Test Case**:

1. Create budget for "Groceries" category: ₱10,000.00
2. Create expense transaction:
   - Category: Groceries
   - Amount: ₱3,000.00
   - Date: Current month
   - Type: Expense
3. Refresh budgets page

**Expected**:

- Progress bar shows 30%
- Shows "₱3,000.00 of ₱10,000.00"
- Shows "₱7,000.00 remaining"
- Badge color: Green (< 80%)

**Test Case 2 (Near Budget)**:

1. Add more Groceries expenses totaling ₱8,500.00
2. Total spent: ₱8,500.00

**Expected**:

- Progress bar shows 85%
- Badge color: Yellow/Amber (80-100%)
- Shows "₱1,500.00 remaining"

**Test Case 3 (Over Budget)**:

1. Add expense of ₱2,000.00
2. Total spent: ₱10,500.00

**Expected**:

- Progress bar shows 105% (capped at 100% visually)
- Badge color: Red (> 100%)
- Shows "₱500.00 over"

---

## 5. Transfer Exclusion ✓

**Critical Test**:

1. Create budget for "Transfer" category: ₱5,000.00
2. Create transfer between accounts:
   - From: Checking
   - To: Savings
   - Amount: ₱3,000.00
3. Check budget progress

**Expected**:

- Progress bar shows 0% (transfers excluded)
- Actual spending: ₱0.00
- Remaining: ₱5,000.00

**Why**: Transfers are NOT expenses - they're account movements.

---

## 6. Copy Previous Month ✓

**Test Case**:

1. Create budgets for January:
   - Groceries: ₱10,000.00
   - Transportation: ₱5,000.00
   - Utilities: ₱3,000.00
2. Navigate to February (empty month)
3. Click "Copy from Previous Month"

**Expected**:

- Toast shows "Budgets copied from previous month"
- All three budgets appear in February
- Amounts match January
- Progress bars show 0% (no February spending yet)

---

## 7. Month Navigation ✓

**Test Case**:

1. Start at current month
2. Click previous month button
3. Verify URL/display updates to previous month
4. Click next month button twice
5. Verify URL/display updates correctly

**Expected**:

- Month display updates (e.g., "January 2024" → "February 2024")
- Budget data loads for selected month
- Navigation works smoothly without errors

---

## 8. Update Budget ✓

**Test Case**:

1. Create budget: Groceries ₱10,000.00
2. Click edit button (if implemented)
3. Change amount to ₱12,000.00
4. Save

**Expected**:

- Toast shows "Budget updated successfully"
- Progress bar updates with new target
- Percentage recalculates
- Remaining amount updates

---

## 9. Total Budget Summary ✓

**Test Case**:

1. Create 3 budgets:
   - Groceries: ₱10,000.00
   - Utilities: ₱3,000.00
   - Transportation: ₱5,000.00
2. Create expenses:
   - Groceries: ₱4,000.00
   - Utilities: ₱2,500.00
   - Transportation: ₱0.00

**Check Summary Cards**:

- Total Budget: ₱18,000.00
- Total Spent: ₱6,500.00
- Remaining: ₱11,500.00 (green text)

**Expected**: All totals calculate correctly

---

## 10. Responsive Design ✓

**Test on different screen sizes**:

**Desktop (> 1024px)**:

- [ ] Full budget list visible
- [ ] Progress bars readable
- [ ] All text legible

**Tablet (768px-1024px)**:

- [ ] Layout adjusts appropriately
- [ ] Navigation still accessible
- [ ] Cards stack if needed

**Mobile (< 768px)**:

- [ ] Budget list scrolls vertically
- [ ] Progress bars don't overflow
- [ ] Buttons remain clickable

---

## 11. Error Handling ✓

**Test Case 1: Negative Amount**:

1. Try to create budget with negative amount
2. **Expected**: Form validation error

**Test Case 2: No Category Selected**:

1. Try to submit form without category
2. **Expected**: "Category is required" error

**Test Case 3: Network Error**:

1. Disconnect internet
2. Try to create budget
3. **Expected**: Toast shows "Failed to save budget"

---

## 12. Performance ✓

**Test with Large Dataset**:

1. Create 20 budgets
2. Add 100+ transactions across categories
3. Navigate between months

**Expected**:

- Page loads in < 2 seconds
- Progress bars render smoothly
- No UI lag when navigating months
- Queries use stale-time caching

---

## Success Criteria

- [ ] Budget form creates/updates budgets
- [ ] Progress bars display correctly
- [ ] Budget vs actual calculates properly
- [ ] Transfers excluded from calculations
- [ ] Copy previous month works
- [ ] Month navigation functional
- [ ] Total summary accurate
- [ ] Responsive on all devices
- [ ] Error handling works
- [ ] Performance acceptable

---

## Common Issues

### Issue: Progress shows incorrect percentage

**Solution**: Check transfer exclusion in `useBudgetActuals`:

```typescript
.is('transfer_group_id', null) // This line is CRITICAL
```

### Issue: Copy previous month doesn't work

**Solution**: Verify month format is 'YYYY-MM-01':

```typescript
const previousMonthStr = previousMonth.toISOString().split("T")[0].substring(0, 7) + "-01";
```

### Issue: Budget form doesn't submit

**Solution**: Check that category_id and amount_cents are valid

---

## Next Steps

Once all checkpoints pass:

1. Commit budget UI code
2. Test with real data
3. Optional: Move to Chunk 017 (transfers) or skip to Chunk 019 (offline)

---

**Estimated Time**: 20-25 minutes to verify all checkpoints
