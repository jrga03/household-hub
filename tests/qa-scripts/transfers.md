# Transfers - QA Test Scripts

---

## Test ID: TRF-001

## Create transfer between accounts

## Priority: High

### Preconditions

- Logged in as test@example.com
- At least 2 accounts exist (e.g., "Cash" and "Checking")

### Steps

1. Navigate to `http://localhost:3000/transactions`
2. Click "Transfer" or "New Transfer" button (`[data-testid="create-transfer"]` or `button:has-text("Transfer")`)
3. Select "Cash" as the "From" account
4. Select "Checking" as the "To" account
5. Enter "1000" in the Amount field
6. Enter "[E2E] Test Transfer" in the Description field
7. Click "Save" or "Create Transfer" button

### Expected Results

- [ ] Toast notification: "Transfer created" or similar
- [ ] Two transactions appear in the list (one expense from Cash, one income to Checking)
- [ ] Both transactions have the same transfer_group_id (linked)
- [ ] Amount shows ₱1,000.00 on both sides

### Cleanup

1. Find and delete both "[E2E] Test Transfer" transactions
2. Or use the transfer delete function if available (should delete both sides)

---

## Test ID: TRF-002

## Verify paired transactions (expense + income)

## Priority: High

### Preconditions

- Logged in as test@example.com
- A transfer exists between two accounts

### Steps

1. Navigate to `http://localhost:3000/transactions`
2. Search for a transfer transaction (look for transfer icon or filter by transfers)
3. Examine both sides of the transfer

### Expected Results

- [ ] One transaction shows as "expense" from the source account
- [ ] One transaction shows as "income" to the destination account
- [ ] Both have identical amounts
- [ ] Both are visually marked as transfers (icon, badge, or color)
- [ ] Both share the same transfer_group_id

### Cleanup

None needed (read-only)

---

## Test ID: TRF-003

## Verify transfer excluded from spending totals

## Priority: High

### Preconditions

- Logged in as test@example.com
- At least one transfer exists
- Note the current total expenses on the dashboard BEFORE the transfer

### Steps

1. Navigate to `http://localhost:3000/dashboard`
2. Note the total expenses shown on the summary card
3. Navigate to `http://localhost:3000/transactions`
4. Sum up all non-transfer expense transactions for the month
5. Compare with the dashboard total

### Expected Results

- [ ] Dashboard expense total does NOT include transfer amounts
- [ ] Manual sum of non-transfer expenses matches the dashboard total
- [ ] Transfer transactions are identifiable (icon or label)
- [ ] Budget actuals do not include transfer amounts

### Cleanup

None needed (read-only)

---

## Test ID: TRF-004

## Verify transfer excluded from analytics charts

## Priority: High

### Preconditions

- Logged in as test@example.com
- Transfers and regular transactions exist

### Steps

1. Navigate to `http://localhost:3000/analytics`
2. Examine the spending by category chart
3. Look for any transfer-related categories in the breakdown

### Expected Results

- [ ] Transfer amounts do not appear in any spending category
- [ ] Category totals exclude transfer amounts
- [ ] Overall spending total matches dashboard (both exclude transfers)
- [ ] No "Transfer" category artificially inflates spending

### Cleanup

None needed (read-only)

---

## Test ID: TRF-005

## Delete transfer (both sides removed)

## Priority: High

### Preconditions

- Logged in as test@example.com
- Create a transfer per TRF-001 first

### Steps

1. Navigate to `http://localhost:3000/transactions`
2. Find the "[E2E] Test Transfer" transaction
3. Click delete or the "..." menu > "Delete"
4. Confirm deletion

### Expected Results

- [ ] Both sides of the transfer are deleted (expense and income)
- [ ] Neither transaction appears in the list after deletion
- [ ] Account balances reflect the removal of both transactions
- [ ] Toast confirms deletion

### Cleanup

None needed (transfer is already deleted)
