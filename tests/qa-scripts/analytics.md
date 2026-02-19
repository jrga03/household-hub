# Analytics - QA Test Scripts

---

## Test ID: ANA-001

## Overview tab with charts

## Priority: High

### Preconditions

- Logged in as test@example.com
- Transactions exist for the current month (mix of income and expense)

### Steps

1. Navigate to `http://localhost:3000/analytics`
2. Wait for charts to render (Recharts renders as SVG)
3. Examine the overview tab

### Expected Results

- [ ] At least one chart is visible (bar chart, pie chart, or line chart)
- [ ] Chart displays spending data for the current period
- [ ] Tooltip appears on hover showing category and amount
- [ ] Chart is responsive (resizes with window)
- [ ] Legend or labels identify each data series

### Cleanup

None needed (read-only)

---

## Test ID: ANA-002

## Category breakdown display

## Priority: High

### Preconditions

- Logged in as test@example.com
- Expense transactions exist across at least 3 categories

### Steps

1. Navigate to `http://localhost:3000/analytics`
2. Locate the "Category Breakdown" section or pie/bar chart
3. Examine category-level data

### Expected Results

- [ ] Each expense category shows its total spending
- [ ] Amounts are in PHP (₱) with proper formatting
- [ ] Categories are sorted by amount (highest first) or alphabetically
- [ ] Color coding distinguishes categories
- [ ] Percentages shown (each category as % of total spending)

### Cleanup

None needed (read-only)

---

## Test ID: ANA-003

## Transfer exclusion verification

## Priority: High

### Preconditions

- Logged in as test@example.com
- Both regular expense transactions and transfers exist
- Know the exact transfer amount for verification

### Steps

1. Navigate to `http://localhost:3000/analytics`
2. Note the total spending amount shown
3. Navigate to `http://localhost:3000/transactions`
4. Filter to show only the current month
5. Manually sum all non-transfer expense transactions
6. Compare with the analytics total

### Expected Results

- [ ] Analytics total spending matches sum of non-transfer expenses
- [ ] Transfer amounts are NOT included in any category's spending
- [ ] No "Transfer" category appears in the breakdown
- [ ] The discrepancy (if any) exactly equals the transfer amount

### Cleanup

None needed (read-only)

---

## Test ID: ANA-004

## Date range filtering

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- Transactions exist across multiple months

### Steps

1. Navigate to `http://localhost:3000/analytics`
2. Locate the date/month filter (`[data-testid="date-filter"]`, `[data-testid="month-selector"]`)
3. Change to the previous month
4. Observe chart and data updates
5. Change back to the current month

### Expected Results

- [ ] Charts update when date range changes
- [ ] Category breakdown reflects only the selected period
- [ ] Totals change to match the selected month's data
- [ ] No loading errors when switching months rapidly

### Cleanup

None needed (read-only)
