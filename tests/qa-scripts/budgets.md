# Budgets - QA Test Scripts

---

## Test ID: BUD-001

## Create budget for category

## Priority: High

### Preconditions

- Logged in as test@example.com
- At least one expense category exists (e.g., "Food")

### Steps

1. Navigate to `http://localhost:3000/budgets`
2. Click "Add Budget" button (`[data-testid="add-budget-btn"]` or `button:has-text("Add Budget")`)
3. Select "Food" from the Category dropdown (`select[name="category_id"]`)
4. Enter "5000" in the Amount field (`input[name="amount"]`)
5. If a notes field exists, enter "[E2E] Test budget"
6. Click "Save" or "Create" button (`button[type="submit"]`)

### Expected Results

- [ ] Toast notification appears: "Budget created" or similar success message
- [ ] New row in budget list showing "Food" category
- [ ] Amount displays as "₱5,000.00"
- [ ] Progress bar shows current spending percentage (green if under 80%)

### Cleanup

1. In the budget list, click the "..." menu or delete icon on the "[E2E]" budget row
2. Click "Delete" and confirm deletion

---

## Test ID: BUD-002

## Edit budget amount

## Priority: High

### Preconditions

- Logged in as test@example.com
- At least one budget exists (create one per BUD-001 if needed)

### Steps

1. Navigate to `http://localhost:3000/budgets`
2. Locate an existing budget row
3. Click "Edit" or the pencil icon (`[data-testid="edit-budget"]` or the "..." menu > "Edit")
4. Change the amount to "8000"
5. Click "Save" or "Update" button

### Expected Results

- [ ] Toast notification: "Budget updated" or similar
- [ ] Amount displays as "₱8,000.00"
- [ ] Progress bar percentage recalculates
- [ ] No other budget fields changed

### Cleanup

Revert the amount back to original if needed, or delete via BUD-003

---

## Test ID: BUD-003

## Delete budget

## Priority: High

### Preconditions

- Logged in as test@example.com
- At least one budget exists

### Steps

1. Navigate to `http://localhost:3000/budgets`
2. Locate a budget row (preferably one created by BUD-001)
3. Click the "..." menu or delete icon
4. Click "Delete"
5. Confirm the deletion in the dialog

### Expected Results

- [ ] Confirmation dialog appears before deletion
- [ ] Toast notification: "Budget deleted" or similar
- [ ] Budget row removed from the list
- [ ] Page does not crash or show errors

### Cleanup

None needed (budget is already deleted)

---

## Test ID: BUD-004

## Copy budgets from previous month

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- Budgets exist for the previous month
- Current month has no budgets (or has fewer)

### Steps

1. Navigate to `http://localhost:3000/budgets`
2. Navigate to a month with no budgets using the month selector
3. Look for "Copy from previous month" button (`[data-testid="copy-budgets"]` or `button:has-text("Copy")`)
4. Click the copy button

### Expected Results

- [ ] Previous month's budget categories and amounts are copied
- [ ] Toast notification confirms copy action
- [ ] Budget list populates with copied entries
- [ ] Amounts match the previous month's targets

### Cleanup

Delete copied budgets if they interfere with other tests

---

## Test ID: BUD-005

## Verify over-budget warning (red progress bar)

## Priority: High

### Preconditions

- Logged in as test@example.com
- A budget exists for a category where actual spending exceeds the target
- Example: Budget for "Food" = ₱1,000, actual spending > ₱1,000

### Steps

1. Navigate to `http://localhost:3000/budgets`
2. Locate the over-budget category row
3. Examine the progress bar and any warning indicators

### Expected Results

- [ ] Progress bar is red or shows danger color (not green/blue)
- [ ] Percentage shows > 100%
- [ ] "Over budget" text or icon is visible
- [ ] Remaining amount shows negative (e.g., "-₱500.00")

### Cleanup

None needed (read-only)

---

## Test ID: BUD-006

## Verify budget vs actual calculation

## Priority: High

### Preconditions

- Logged in as test@example.com
- A budget exists with known target
- Transactions exist for the budget's category in the current month
- CRITICAL: No transfer transactions in the category (transfers must be excluded)

### Steps

1. Navigate to `http://localhost:3000/budgets`
2. Locate a budget with known target and spending
3. Verify the "Actual" or "Spent" column
4. Cross-reference with transactions page: filter by category and current month

### Expected Results

- [ ] Actual spending matches sum of expense transactions for that category
- [ ] Transfer transactions are NOT counted in the actual total
- [ ] Percentage = (actual / target) \* 100
- [ ] Remaining = target - actual
- [ ] Status is correct: "under" (<80%), "near" (80-100%), "over" (>100%)

### Cleanup

None needed (read-only)
