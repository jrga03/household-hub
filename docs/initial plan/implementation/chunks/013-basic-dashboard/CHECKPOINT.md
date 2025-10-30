# Checkpoint: Basic Dashboard

Verify the complete dashboard works correctly.

---

## 1. Page Loads ✓

Visit `http://localhost:3000/`

**Check**:

- [ ] Dashboard loads without errors
- [ ] All 4 summary cards display
- [ ] Monthly trend chart renders
- [ ] Category breakdown chart shows
- [ ] Recent transactions list displays
- [ ] Month selector functional
- [ ] No console errors

---

## 2. Summary Cards Display ✓

**Check All 4 Cards**:

- [ ] Total Income card (green icon)
- [ ] Total Expenses card (red icon)
- [ ] Net Amount card (blue/orange icon)
- [ ] Total Balance card (purple icon)

**Check Data**:

- [ ] Amounts formatted as PHP currency
- [ ] Icons display correctly
- [ ] Comparison percentages show
- [ ] Transaction/account counts accurate

---

## 3. Transfer Exclusion Works ✓

**CRITICAL TEST**: Transfers MUST be excluded from income/expense totals

**Setup**:

1. Note current month income and expense totals
2. Create transfer: ₱5,000 from Checking → Savings
3. Refresh dashboard

**Expected**:

- Income total unchanged
- Expense total unchanged
- Transfer not counted in summaries
- Only shows in account balances

**Check**:

- [ ] Transfers excluded from income/expense
- [ ] Net amount correct (doesn't include transfers)
- [ ] Charts don't show transfer amounts

---

## 4. Monthly Trend Chart Works ✓

**Check Chart Elements**:

- [ ] X-axis shows last 6 months (abbreviated month names)
- [ ] Y-axis shows PHP amounts
- [ ] Income line displayed (green)
- [ ] Expense line displayed (red)
- [ ] Grid lines visible
- [ ] Legend shows "Income" and "Expenses"

**Check Interactivity**:

- [ ] Hover shows tooltip with exact amounts
- [ ] Tooltip formatted as PHP currency
- [ ] Chart responsive (resizes with window)

---

## 5. Category Breakdown Chart Works ✓

**Check Pie Chart**:

- [ ] Pie chart renders with category slices
- [ ] Each slice colored by category color
- [ ] Percentage labels on slices
- [ ] Tooltips show category name and amount

**Check Legend**:

- [ ] Top 5 categories listed
- [ ] Color indicators match pie slices
- [ ] Amounts displayed in PHP currency
- [ ] "X more categories" shown if >5

**Check Empty State**:

1. Navigate to month with no expenses
2. **Expected**:
   - "No spending data" message
   - No broken chart layout

---

## 6. Recent Transactions List ✓

**Check List Items**:

- [ ] Shows last 10 transactions
- [ ] Each transaction has description
- [ ] Date formatted (e.g., "Jan 15")
- [ ] Account name shown
- [ ] Category name and color indicator shown
- [ ] Amount with +/- prefix
- [ ] Status label (pending/cleared)

**Check "View All" Button**:

1. Click "View All" link
2. **Expected**:
   - Navigates to /transactions
   - Shows full transaction list

**Check Empty State**:

1. Use database with no transactions
2. **Expected**:
   - "No transactions yet" message
   - No broken layout

---

## 7. Month Navigation Works ✓

**Test Month Selector**:

1. Click previous month
2. **Expected**:
   - All data updates for that month
   - Summary cards recalculate
   - Charts update
   - Recent transactions for that month

3. Click next month
4. **Expected**:
   - Returns to next month
   - Cannot go beyond current month

5. Click "Current" button (if not on current month)
6. **Expected**:
   - Returns to current month
   - Button disappears

**Check**:

- [ ] Previous/next buttons work
- [ ] Data updates correctly
- [ ] Charts re-render
- [ ] Can't navigate past current month

---

## 8. Summary Card Comparisons ✓

**Setup**: Create data for two months

- Previous month: ₱10,000 income, ₱8,000 expenses
- Current month: ₱12,000 income, ₱9,000 expenses

**Expected**:

- Income: +20.0% from last month
- Expenses: +12.5% from last month

**Check**:

- [ ] Percentage change calculated correctly
- [ ] Increase shown in appropriate color
- [ ] Decrease shown in green
- [ ] No comparison if no previous month data

---

## 9. Net Amount Color Coding ✓

**Test Case 1: Positive net (income > expenses)**

- Income: ₱15,000
- Expenses: ₱10,000
- Net: +₱5,000

**Expected**:

- Net amount in green
- Blue icon

**Test Case 2: Negative net (expenses > income)**

- Income: ₱8,000
- Expenses: ₱12,000
- Net: -₱4,000

**Expected**:

- Net amount in red
- Orange icon

**Check**:

- [ ] Positive net displayed in green
- [ ] Negative net displayed in red
- [ ] Icon color changes appropriately

---

## 10. Total Balance Accuracy ✓

**Setup**: Known account balances

- Checking: ₱10,000
- Savings: ₱5,000
- Cash: ₱2,000

**Expected Total Balance**: ₱17,000

**Check**:

- [ ] Total balance = sum of all account balances
- [ ] Includes all active accounts
- [ ] Account count correct
- [ ] Balance updates when transactions change

---

## 11. Monthly Trend Data Accuracy ✓

**Check Historical Data**:

- [ ] Shows correct 6-month range
- [ ] Most recent month on right
- [ ] Each month's totals accurate
- [ ] No data gaps or duplicates

**Verify Math**:

1. Pick one month from chart
2. Manually sum transactions for that month
3. **Expected**: Chart value matches manual calculation

---

## 12. Category Breakdown Math ✓

**Setup**: Known spending

- Groceries: ₱4,000
- Dining: ₱2,000
- Gas: ₱3,000
- Total: ₱9,000

**Expected Percentages**:

- Groceries: 44.4%
- Dining: 22.2%
- Gas: 33.3%

**Check**:

- [ ] Percentages sum to ~100%
- [ ] Each category percentage accurate
- [ ] Pie chart slices sized correctly

---

## 13. Loading State ✓

**Test Case**:

1. Throttle network (DevTools → Slow 3G)
2. Reload dashboard

**Expected**:

- Loading spinner displays
- Centered on page
- No flash of wrong content
- Smooth transition when data loads

**Check**:

- [ ] Loading state shows
- [ ] No layout shift
- [ ] Clean transition to content

---

## 14. Mobile Responsiveness ✓

**Test at different widths**:

- Mobile (320px-640px)
- Tablet (641px-1024px)
- Desktop (1024px+)

**Check**:

- [ ] Summary cards stack on mobile (1 column)
- [ ] Cards in 2 columns on tablet
- [ ] Cards in 4 columns on desktop
- [ ] Charts resize smoothly
- [ ] Recent transactions list readable
- [ ] Month selector works on mobile
- [ ] Touch targets adequate

---

## 15. Chart Tooltips ✓

**Monthly Trend Chart**:

1. Hover over data point
2. **Expected**:
   - Tooltip shows month name
   - Income amount formatted
   - Expense amount formatted
   - Tooltip styled (border, shadow)

**Category Chart**:

1. Hover over pie slice
2. **Expected**:
   - Category name shown
   - Amount formatted
   - Percentage displayed

**Check**:

- [ ] Tooltips appear on hover
- [ ] Data formatted correctly
- [ ] Styled consistently
- [ ] Tooltips position correctly (don't go off-screen)

---

## 16. Real-Time Updates ✓

**Test Case**:

1. Note current month expense total
2. Add new expense transaction (₱500)
3. **Expected**:
   - Summary cards update
   - Expense total increases by ₱500
   - Net amount decreases by ₱500
   - Transaction appears in recent list
   - Charts update

**Check**:

- [ ] Data refreshes after mutations
- [ ] Cache invalidation works
- [ ] No manual refresh needed

---

## 17. Empty States ✓

**Test All Empty Scenarios**:

**No transactions at all**:

- [ ] Summary cards show ₱0.00
- [ ] Charts show empty state
- [ ] Recent transactions shows "No transactions yet"

**No expenses (only income)**:

- [ ] Category chart shows "No spending data"
- [ ] Expense summary shows ₱0.00
- [ ] No broken layouts

---

## 18. Performance ✓

**Test with large dataset** (if available):

- 1000+ transactions in database
- Multiple accounts
- Multiple categories

**Expected**:

- [ ] Dashboard loads in <200ms
- [ ] Charts render smoothly
- [ ] No lag or freezing
- [ ] Scroll smooth

**Check Network Tab**:

- [ ] Single query for dashboard data
- [ ] No N+1 queries
- [ ] Query completes quickly (<150ms)

---

## 19. Transaction Count Accuracy ✓

**Check**:

- [ ] "X transactions this month" count correct
- [ ] Matches actual transaction count
- [ ] Updates when transactions added/removed
- [ ] Only counts current month

---

## 20. Currency Formatting ✓

**Check All Amounts**:

- [ ] Format: ₱1,234.56
- [ ] Thousands separator (comma)
- [ ] Two decimal places always
- [ ] Peso sign (₱) prefix
- [ ] Negative amounts: -₱1,234.56
- [ ] Zero amounts: ₱0.00

---

## Success Criteria

- [ ] All 4 summary cards display correctly
- [ ] Transfers EXCLUDED from income/expense
- [ ] Monthly trend chart shows 6 months
- [ ] Category breakdown chart accurate
- [ ] Recent transactions list functional
- [ ] Month navigation works
- [ ] Comparisons with previous month accurate
- [ ] Loading and empty states handled
- [ ] Charts responsive and interactive
- [ ] Real-time updates working
- [ ] Performance smooth with large datasets
- [ ] No console errors
- [ ] **Dashboard is production-ready!**

---

## Next Steps

Once verified:

1. Commit dashboard code
2. Test with real usage patterns
3. Consider adding more chart types (optional)
4. Move to chunk 014 (budgets basic) - final MVP chunk!

---

**Time**: 25-35 minutes to verify all checkpoints
