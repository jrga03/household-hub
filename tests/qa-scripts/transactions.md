# Transactions - QA Test Scripts

---

## Test ID: TXN-001

## Create expense transaction (all fields)

## Priority: High

### Preconditions

- Logged in as test@example.com / TestPassword123!
- At least one account exists (e.g., "BDO Checking")
- At least one expense category exists (e.g., "Groceries")
- Network is online

### Steps

1. Navigate to `http://localhost:3000/transactions`
2. Click the "Add Transaction" button (`[data-testid="add-transaction-btn"]` or button labeled "Add Transaction")
3. Set the **Date** field to today's date (`input[name="date"]` or `[data-testid="transaction-date"]`)
4. Enter `[E2E] Grocery run SM Supermarket` in the **Description** field (`input[name="description"]` or `[data-testid="transaction-description"]`)
5. Enter `2,500.00` in the **Amount** field (`input[name="amount"]` or `[data-testid="transaction-amount"]`)
6. Select `Expense` for the **Type** field (`select[name="type"]` or the "Expense" toggle/radio option)
7. Select `BDO Checking` in the **Account** dropdown (`select[name="account_id"]` or `[data-testid="transaction-account"]`)
8. Select `Groceries` in the **Category** dropdown (`select[name="category_id"]` or `[data-testid="transaction-category"]`)
9. Set **Status** to `Cleared` (`select[name="status"]` or the "Cleared" option)
10. Set **Visibility** to `Household` (`select[name="visibility"]` or the "Household" option)
11. Enter `Monthly grocery budget test run` in the **Notes** field (`textarea[name="notes"]` or `[data-testid="transaction-notes"]`)
12. Click the "Save" or "Create" button (`button[type="submit"]` or `[data-testid="save-transaction-btn"]`)

### Expected Results

- [ ] Transaction form closes or navigates back to the list
- [ ] A success toast notification appears (e.g., "Transaction created")
- [ ] The new transaction `[E2E] Grocery run SM Supermarket` appears in the transactions list
- [ ] Amount is displayed as `₱2,500.00` with expense styling (negative or red indicator)
- [ ] Account column shows `BDO Checking`
- [ ] Category column shows `Groceries`
- [ ] Status is shown as `Cleared`
- [ ] Visibility is shown as `Household`
- [ ] Notes are accessible when viewing the transaction detail

### Cleanup

1. Locate the `[E2E] Grocery run SM Supermarket` transaction in the list
2. Click the delete or actions menu (`[data-testid="transaction-actions"]` or "..." menu)
3. Select "Delete" and confirm the deletion dialog
4. Verify the transaction no longer appears in the list

---

## Test ID: TXN-002

## Create income transaction

## Priority: High

### Preconditions

- Logged in as test@example.com / TestPassword123!
- At least one account exists (e.g., "BDO Checking")
- At least one income category exists (e.g., "Salary")
- Network is online

### Steps

1. Navigate to `http://localhost:3000/transactions`
2. Click the "Add Transaction" button (`[data-testid="add-transaction-btn"]`)
3. Set the **Date** field to today's date (`input[name="date"]`)
4. Enter `[E2E] Monthly salary deposit` in the **Description** field (`input[name="description"]`)
5. Enter `45,000.00` in the **Amount** field (`input[name="amount"]`)
6. Select `Income` for the **Type** field (`select[name="type"]` or the "Income" toggle/radio option)
7. Select `BDO Checking` in the **Account** dropdown (`select[name="account_id"]`)
8. Select `Salary` in the **Category** dropdown (`select[name="category_id"]`)
9. Click the "Save" or "Create" button (`button[type="submit"]`)

### Expected Results

- [ ] Transaction form closes or navigates back to the list
- [ ] A success toast notification appears (e.g., "Transaction created")
- [ ] The new transaction `[E2E] Monthly salary deposit` appears in the transactions list
- [ ] Amount is displayed as `₱45,000.00` with income styling (positive or green indicator)
- [ ] Type is shown as `Income`
- [ ] Account column shows `BDO Checking`
- [ ] Category column shows `Salary`

### Cleanup

1. Locate the `[E2E] Monthly salary deposit` transaction in the list
2. Click the delete or actions menu (`[data-testid="transaction-actions"]` or "..." menu)
3. Select "Delete" and confirm the deletion dialog
4. Verify the transaction no longer appears in the list

---

## Test ID: TXN-003

## Edit transaction description and amount

## Priority: High

### Preconditions

- Logged in as test@example.com / TestPassword123!
- An existing transaction with description `[E2E] Edit target transaction` and amount `₱1,000.00` exists
  - Create one manually before running this test if it does not exist

### Steps

1. Navigate to `http://localhost:3000/transactions`
2. Locate the transaction `[E2E] Edit target transaction` in the list
3. Click the edit button or actions menu for that transaction (`[data-testid="transaction-actions"]` → "Edit", or click the row to open detail)
4. Clear the **Description** field and enter `[E2E] Edit target transaction - updated`
5. Clear the **Amount** field and enter `1,850.75`
6. Click the "Save" or "Update" button (`button[type="submit"]` or `[data-testid="save-transaction-btn"]`)

### Expected Results

- [ ] A success toast notification appears (e.g., "Transaction updated")
- [ ] The transaction list now shows `[E2E] Edit target transaction - updated` (old description is gone)
- [ ] The amount is displayed as `₱1,850.75`
- [ ] No duplicate entry exists for the old description
- [ ] Other fields (account, category, date) remain unchanged from the original

### Cleanup

1. Locate the `[E2E] Edit target transaction - updated` transaction in the list
2. Click the delete or actions menu and select "Delete"
3. Confirm the deletion dialog
4. Verify the transaction no longer appears in the list

---

## Test ID: TXN-004

## Delete transaction with confirmation

## Priority: High

### Preconditions

- Logged in as test@example.com / TestPassword123!
- An existing transaction with description `[E2E] Delete me transaction` exists
  - Create one manually before running this test if it does not exist

### Steps

1. Navigate to `http://localhost:3000/transactions`
2. Locate the transaction `[E2E] Delete me transaction` in the list
3. Click the delete or actions menu for that transaction (`[data-testid="transaction-actions"]` or "..." menu)
4. Select "Delete" from the menu
5. Observe that a confirmation dialog appears
6. Click "Cancel" in the confirmation dialog
7. Verify the transaction is still present in the list
8. Open the actions menu again and select "Delete"
9. Click "Confirm" or "Delete" in the confirmation dialog

### Expected Results

- [ ] A confirmation dialog appears before deletion (step 5)
- [ ] Clicking "Cancel" dismisses the dialog without deleting the record (step 6-7)
- [ ] After confirming deletion, a success toast appears (e.g., "Transaction deleted")
- [ ] The transaction `[E2E] Delete me transaction` no longer appears in the list
- [ ] The page does not navigate away or produce an error
- [ ] No other transactions are affected

### Cleanup

No cleanup needed (deletion is the test action). If the test fails before step 9, manually delete `[E2E] Delete me transaction` via the actions menu.

---

## Test ID: TXN-005

## Filter by date range

## Priority: High

### Preconditions

- Logged in as test@example.com / TestPassword123!
- At least two transactions exist:
  - `[E2E] Date filter - in range` with a date within the last 7 days
  - `[E2E] Date filter - out of range` with a date from 60 days ago

### Steps

1. Navigate to `http://localhost:3000/transactions`
2. Locate the date range filter controls (`[data-testid="filter-date-from"]` and `[data-testid="filter-date-to"]`, or a date picker labeled "From" / "To")
3. Set the **From** date to 14 days ago
4. Set the **To** date to today
5. Apply the filter (click "Apply" or observe auto-filter behavior)
6. Inspect the transaction list

### Expected Results

- [ ] Only transactions dated within the specified 14-day range are shown
- [ ] `[E2E] Date filter - in range` is visible in the list
- [ ] `[E2E] Date filter - out of range` is NOT visible in the list
- [ ] The filter controls reflect the selected date values
- [ ] Clearing the date filter (clicking "Clear" or "Reset") restores all transactions

### Cleanup

1. Clear the date range filter to restore the default view
2. Delete `[E2E] Date filter - in range` via the actions menu
3. Delete `[E2E] Date filter - out of range` via the actions menu

---

## Test ID: TXN-006

## Filter by account

## Priority: Medium

### Preconditions

- Logged in as test@example.com / TestPassword123!
- At least two accounts exist (e.g., "BDO Checking" and "GCash")
- At least one transaction exists linked to `BDO Checking` with description `[E2E] BDO account filter test`
- At least one transaction exists linked to `GCash` with description `[E2E] GCash account filter test`

### Steps

1. Navigate to `http://localhost:3000/transactions`
2. Locate the account filter control (`[data-testid="filter-account"]` or a dropdown labeled "Account")
3. Select `BDO Checking` from the account filter dropdown
4. Inspect the transaction list

### Expected Results

- [ ] Only transactions linked to `BDO Checking` are displayed
- [ ] `[E2E] BDO account filter test` is visible in the list
- [ ] `[E2E] GCash account filter test` is NOT visible in the list
- [ ] The account filter dropdown displays `BDO Checking` as the selected value
- [ ] Changing the filter to `GCash` shows GCash transactions and hides BDO transactions
- [ ] Clearing the filter (selecting "All Accounts" or resetting) restores all transactions

### Cleanup

1. Clear the account filter to restore the default view
2. Delete `[E2E] BDO account filter test` via the actions menu
3. Delete `[E2E] GCash account filter test` via the actions menu

---

## Test ID: TXN-007

## Filter by category and type

## Priority: Medium

### Preconditions

- Logged in as test@example.com / TestPassword123!
- At least two transactions exist:
  - `[E2E] Category filter - expense` with type `Expense` and category `Groceries`
  - `[E2E] Category filter - income` with type `Income` and category `Salary`

### Steps

1. Navigate to `http://localhost:3000/transactions`
2. Locate the category filter control (`[data-testid="filter-category"]` or a dropdown labeled "Category")
3. Select `Groceries` from the category filter
4. Inspect the transaction list
5. Locate the type filter control (`[data-testid="filter-type"]` or a toggle/dropdown labeled "Type")
6. Select `Expense` from the type filter (with `Groceries` still selected)
7. Inspect the filtered list

### Expected Results

- [ ] After step 3: Only transactions in the `Groceries` category are shown
- [ ] `[E2E] Category filter - expense` is visible after category filter (step 3)
- [ ] `[E2E] Category filter - income` is NOT visible after category filter (step 3)
- [ ] After step 6: Only expense transactions in `Groceries` are shown (filters combine)
- [ ] `[E2E] Category filter - expense` remains visible with both filters active
- [ ] Clearing both filters restores all transactions

### Cleanup

1. Clear all active filters to restore the default view
2. Delete `[E2E] Category filter - expense` via the actions menu
3. Delete `[E2E] Category filter - income` via the actions menu

---

## Test ID: TXN-008

## Search by description

## Priority: Medium

### Preconditions

- Logged in as test@example.com / TestPassword123!
- At least two transactions exist:
  - `[E2E] Search target Meralco bill`
  - `[E2E] Search other transaction`

### Steps

1. Navigate to `http://localhost:3000/transactions`
2. Locate the search input field (`[data-testid="transaction-search"]` or `input[placeholder*="Search"]`)
3. Type `Meralco` in the search field
4. Observe the filtered transaction list (auto-filter or press Enter if required)
5. Clear the search field
6. Type `[E2E] Search` in the search field and observe the results

### Expected Results

- [ ] After step 3: Only transactions whose description contains "Meralco" are displayed
- [ ] `[E2E] Search target Meralco bill` is visible in the results
- [ ] `[E2E] Search other transaction` is NOT visible after the "Meralco" search
- [ ] After step 5: All transactions are restored
- [ ] After step 6: Both `[E2E] Search target Meralco bill` and `[E2E] Search other transaction` are visible (both match the `[E2E] Search` prefix)
- [ ] Search is case-insensitive (typing `meralco` yields the same results as `Meralco`)
- [ ] Clearing the search field restores the full unfiltered list

### Cleanup

1. Clear the search field to restore the default view
2. Delete `[E2E] Search target Meralco bill` via the actions menu
3. Delete `[E2E] Search other transaction` via the actions menu
