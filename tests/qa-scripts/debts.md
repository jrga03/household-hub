# Debts - QA Test Scripts

---

## Test ID: DBT-001

## Create external debt

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- Debts page is accessible

### Steps

1. Navigate to `http://localhost:3000/debts`
2. Click "Add Debt" or "New Debt" button (`[data-testid="add-debt-btn"]`)
3. Enter debt details:
   - Name/Creditor: "[E2E] Test Loan"
   - Total Amount: "50000" (₱50,000)
   - Type: "external" or "owed to others"
   - Description/Notes: "[E2E] Test external debt"
4. Click "Save" or "Create"

### Expected Results

- [ ] Toast notification confirms creation
- [ ] Debt appears in the debt list
- [ ] Shows total amount: ₱50,000.00
- [ ] Balance shows full amount (no payments yet)
- [ ] Status shows "active" or similar

### Cleanup

1. Delete the "[E2E] Test Loan" debt

---

## Test ID: DBT-002

## Link payment to debt

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- An active debt exists (create per DBT-001)

### Steps

1. Navigate to `http://localhost:3000/debts`
2. Click on the "[E2E] Test Loan" debt to view details
3. Click "Add Payment" or "Record Payment" (`[data-testid="add-payment"]`)
4. Enter payment amount: "5000" (₱5,000)
5. Enter description: "[E2E] Debt Payment"
6. Click "Save"

### Expected Results

- [ ] Payment recorded successfully (toast notification)
- [ ] Debt balance updated: ₱50,000 - ₱5,000 = ₱45,000
- [ ] Payment appears in payment history
- [ ] Progress bar updates (10% paid)
- [ ] A corresponding expense transaction is created

### Cleanup

1. Delete the payment
2. Delete the "[E2E] Test Loan" debt

---

## Test ID: DBT-003

## Verify balance calculation

## Priority: High

### Preconditions

- Logged in as test@example.com
- A debt exists with multiple payments

### Steps

1. Navigate to `http://localhost:3000/debts`
2. Click on a debt with known payment history
3. Examine the balance and payment summary

### Expected Results

- [ ] Current balance = Total amount - Sum of all payments
- [ ] Payment history shows each payment with date and amount
- [ ] Running balance after each payment is correct
- [ ] Amounts are in PHP (₱) with proper formatting

### Cleanup

None needed (read-only)

---

## Test ID: DBT-004

## Reverse payment

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- A debt with at least one payment exists

### Steps

1. Navigate to `http://localhost:3000/debts`
2. Click on the debt to view details
3. In payment history, find a payment
4. Click "Delete" or "Reverse" on the payment
5. Confirm the action

### Expected Results

- [ ] Payment is removed from history
- [ ] Debt balance increases by the reversed amount
- [ ] Corresponding transaction is deleted or reversed
- [ ] Progress bar updates to reflect the reversal

### Cleanup

None needed (payment is already reversed)

---

## Test ID: DBT-005

## Archive debt

## Priority: Low

### Preconditions

- Logged in as test@example.com
- A fully paid debt exists (balance = 0) or any active debt

### Steps

1. Navigate to `http://localhost:3000/debts`
2. Find a debt to archive
3. Click "Archive" or "Mark as Paid" (`[data-testid="archive-debt"]`)
4. Confirm the action

### Expected Results

- [ ] Debt status changes to "archived" or "paid_off"
- [ ] Debt moves to an "Archived" section or tab
- [ ] Debt no longer appears in active debts list
- [ ] Archived debt is still viewable (not deleted)

### Cleanup

Unarchive the debt if the test used a real debt
