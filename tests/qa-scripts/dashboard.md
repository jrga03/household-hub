# Dashboard - QA Test Scripts

---

## Test ID: DASH-001

## Verify summary cards (income/expense/net)

## Priority: High

### Preconditions

- Logged in as test@example.com
- At least one income and one expense transaction exist for the current month

### Steps

1. Navigate to `http://localhost:3000/dashboard`
2. Wait for the page to fully load (loading spinners gone)
3. Locate the summary cards section (`[data-testid="dashboard-summary"]` or the top card area)

### Expected Results

- [ ] Income card shows a positive PHP amount (e.g., "₱50,000.00")
- [ ] Expense card shows a positive PHP amount
- [ ] Net/Balance card shows income minus expenses
- [ ] All amounts are properly formatted with ₱ symbol and comma separators
- [ ] Cards have distinct visual styling (colors or icons)

### Cleanup

None needed (read-only)

---

## Test ID: DASH-002

## Verify recent transactions list

## Priority: High

### Preconditions

- Logged in as test@example.com
- At least 3 transactions exist

### Steps

1. Navigate to `http://localhost:3000/dashboard`
2. Scroll down to the "Recent Transactions" section
3. Examine the list of transactions

### Expected Results

- [ ] Recent transactions are displayed in reverse chronological order
- [ ] Each row shows: date, description, amount, and type (income/expense)
- [ ] Amounts are formatted in PHP (₱)
- [ ] Income and expense are visually differentiated (color or icon)
- [ ] List shows up to 5-10 most recent transactions

### Cleanup

None needed (read-only)

---

## Test ID: DASH-003

## Month selector changes data

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- Transactions exist in at least two different months

### Steps

1. Navigate to `http://localhost:3000/dashboard`
2. Locate the month selector (`[data-testid="month-selector"]` or date navigation buttons)
3. Click "Previous" or the left arrow to go to the previous month
4. Observe the summary cards and recent transactions

### Expected Results

- [ ] Summary cards update to show the previous month's totals
- [ ] Recent transactions list updates to show that month's transactions
- [ ] Month/year label updates to reflect the selected period
- [ ] Clicking "Next" returns to the current month

### Cleanup

None needed (read-only)

---

## Test ID: DASH-004

## Account balances display correctly

## Priority: High

### Preconditions

- Logged in as test@example.com
- At least 2 accounts exist with transactions

### Steps

1. Navigate to `http://localhost:3000/dashboard`
2. Locate the account balances section (`[data-testid="account-balances"]`)

### Expected Results

- [ ] Each account shows its name and current balance
- [ ] Balances are formatted in PHP (₱)
- [ ] Account types are displayed (Cash, Bank, etc.)
- [ ] Balances reflect the sum of all transactions for each account

### Cleanup

None needed (read-only)
