# D9 Verification: Transaction Form Integration

## Quick Verification (3 minutes)

```bash
npm run dev
# Navigate to transaction form
# Create transaction with debt link
# Verify payment created in debt_payments table
```

---

## Part 1: Debt Selector Display

### Selector Shows Active Debts

```tsx
// Open transaction form
// Check "Link to Debt (Optional)" dropdown

// Expected options:
// - None
// - Car Loan - Balance: ₱1,000.00
// - Credit Card - Balance: ₱500.00
// (Only active debts, not archived/paid_off)
```

### Balances Display Correctly

```tsx
import { listDebts, calculateDebtBalance } from "@/lib/debts";

// Verify balances match
const debts = await listDebts("h1", "external", { status: "active" });

for (const debt of debts) {
  const balance = await calculateDebtBalance(debt.id, "external");
  console.log(`${debt.name}: ${formatPHP(balance)}`);
}

// Dropdown should show exact same balances
```

### None Option Clears Selection

```tsx
// Select a debt
// Verify debt_id set in form

// Select "None"
// Expected: debt_id cleared (undefined)
// Expected: Preview panel disappears
```

---

## Part 2: Real-Time Balance Preview

### Preview Shows Correctly

```tsx
// Select debt with ₱1,000 balance
// Type amount: ₱500

// Expected preview:
// Current balance: ₱1,000.00
// Payment amount: -₱500.00
// After payment: ₱500.00
```

### Overpayment Warning

```tsx
// Select debt with ₱1,000 balance
// Type amount: ₱1,200

// Expected preview:
// Current balance: ₱1,000.00
// Payment amount: -₱1,200.00
// After payment: ₱-200.00 (red text)
// ⚠ This will overpay by ₱200.00
```

### Exact Payoff Celebration

```tsx
// Select debt with ₱1,000 balance
// Type amount: ₱1,000

// Expected preview:
// Current balance: ₱1,000.00
// Payment amount: -₱1,000.00
// After payment: ₱0.00 (green text)
// ✓ This will pay off the debt completely
```

### Preview Updates on Amount Change

```tsx
// Select debt, type ₱500
// Preview shows ₱500 after payment

// Change to ₱300
// Expected: Preview updates immediately to ₱700 after payment

// Change to ₱1,500
// Expected: Preview updates to overpayment warning
```

---

## Part 3: Transaction Create with Debt Link

### Successful Creation

```tsx
import { db } from "@/lib/dexie";

// Create transaction via form:
// - Amount: ₱500
// - Date: 2025-11-10
// - Category: Miscellaneous
// - Debt: Car Loan

// Click "Save"

// Verify transaction created
const transaction = await db.transactions.where("amount_cents").equals(50000).first();
console.assert(transaction !== undefined);

// Verify payment created
const payment = await db.debtPayments.where("transaction_id").equals(transaction.id).first();
console.assert(payment !== undefined);
console.assert(payment.amount_cents === 50000);
console.assert(payment.debt_id === debtId);

// Verify success toast
// Expected: "Transaction saved and payment applied to Car Loan"
```

### Without Debt Link

```tsx
// Create transaction without selecting debt
// Click "Save"

// Verify transaction created
const transaction = await db.transactions.where("amount_cents").equals(50000).first();
console.assert(transaction !== undefined);

// Verify NO payment created
const payment = await db.debtPayments.where("transaction_id").equals(transaction.id).first();
console.assert(payment === undefined);

// Verify success toast
// Expected: "Transaction saved successfully" (no debt mention)
```

### Balance Updates After Creation

```tsx
// Before: Debt balance ₱1,000
const balanceBefore = await calculateDebtBalance(debtId, "external");
console.log("Before:", balanceBefore); // 100000

// Create ₱500 payment
await createTransactionWithDebt({ amount_cents: 50000, debt_id: debtId });

// After: Debt balance ₱500
const balanceAfter = await calculateDebtBalance(debtId, "external");
console.log("After:", balanceAfter); // 50000
console.assert(balanceAfter === 50000);
```

---

## Part 4: Transaction Edit with Debt Link

### Edit Amount

```tsx
// Initial: Transaction ₱500 linked to debt
// Debt balance: ₱500 (after ₱500 payment)

// Edit transaction amount to ₱300
await updateTransaction(transactionId, { amount_cents: 30000 });

// Verify reversal created
const reversals = await db.debtPayments
  .where("transaction_id")
  .equals(transactionId)
  .and((p) => p.is_reversal === true)
  .toArray();
console.assert(reversals.length > 0);
console.assert(reversals[0].amount_cents === -50000); // Reverses ₱500

// Verify new payment created
const newPayment = await db.debtPayments
  .where("transaction_id")
  .equals(transactionId)
  .and((p) => !p.is_reversal && p.amount_cents === 30000)
  .first();
console.assert(newPayment !== undefined);

// Verify balance updated
const newBalance = await calculateDebtBalance(debtId, "external");
console.assert(newBalance === 70000); // ₱700 (₱1,000 - ₱300)
```

### Add Debt Link to Existing Transaction

```tsx
// Initial: Transaction ₱500 with NO debt link
// Create transaction
const txn = await createTransaction({ amount_cents: 50000 });

// Edit to add debt link
await updateTransaction(txn.id, { debt_id: debtId });

// Verify payment created
const payment = await db.debtPayments.where("transaction_id").equals(txn.id).first();
console.assert(payment !== undefined);
console.assert(payment.debt_id === debtId);
```

### Remove Debt Link

```tsx
// Initial: Transaction ₱500 linked to debt
const txn = await createTransactionWithDebt({ amount_cents: 50000, debt_id: debtId });

// Edit to remove debt link
await updateTransaction(txn.id, { debt_id: undefined });

// Verify payment reversed
const reversals = await db.debtPayments
  .where("transaction_id")
  .equals(txn.id)
  .and((p) => p.is_reversal === true)
  .toArray();
console.assert(reversals.length > 0);

// Verify balance restored
const balance = await calculateDebtBalance(debtId, "external");
console.assert(balance === 100000); // Back to ₱1,000
```

### Change Debt Link to Different Debt

```tsx
// Initial: Transaction ₱500 linked to Debt A
const txn = await createTransactionWithDebt({ amount_cents: 50000, debt_id: debtA.id });

// Edit to link to Debt B
await updateTransaction(txn.id, { debt_id: debtB.id });

// Verify Debt A payment reversed
const debtABalance = await calculateDebtBalance(debtA.id, "external");
console.assert(debtABalance === debtA.original_amount_cents); // Restored

// Verify Debt B payment created
const debtBPayment = await db.debtPayments
  .where("transaction_id")
  .equals(txn.id)
  .and((p) => !p.is_reversal && p.debt_id === debtB.id)
  .first();
console.assert(debtBPayment !== undefined);

const debtBBalance = await calculateDebtBalance(debtB.id, "external");
console.assert(debtBBalance === debtB.original_amount_cents - 50000);
```

---

## Part 5: Transaction Delete with Debt Link

### Delete Reverses Payment

```tsx
// Create transaction with debt link
const txn = await createTransactionWithDebt({ amount_cents: 50000, debt_id: debtId });

// Initial balance: ₱500 (after ₱500 payment)
const balanceBefore = await calculateDebtBalance(debtId, "external");
console.log("Before delete:", balanceBefore); // 50000

// Delete transaction
await deleteTransaction(txn.id);

// Verify reversal created
const reversals = await db.debtPayments
  .where("transaction_id")
  .equals(txn.id)
  .and((p) => p.is_reversal === true)
  .toArray();
console.assert(reversals.length > 0);

// Verify balance restored
const balanceAfter = await calculateDebtBalance(debtId, "external");
console.assert(balanceAfter === 100000); // Back to ₱1,000

// Verify transaction deleted
const deleted = await db.transactions.get(txn.id);
console.assert(deleted === undefined);
```

### Delete Without Debt Link (No Reversal)

```tsx
// Create transaction WITHOUT debt link
const txn = await createTransaction({ amount_cents: 50000 });

// Delete transaction
await deleteTransaction(txn.id);

// Verify NO payments exist
const payments = await db.debtPayments.where("transaction_id").equals(txn.id).toArray();
console.assert(payments.length === 0);

// Verify transaction deleted
const deleted = await db.transactions.get(txn.id);
console.assert(deleted === undefined);
```

---

## Part 6: Validation Rules

### Transfer Cannot Link to Debt

```tsx
// Create transfer transaction
// Open transaction form in transfer mode
// Expected: Debt selector DISABLED
// Expected: Description: "Transfers cannot be linked to debts"

// Try to set debt_id programmatically
form.setValue("debt_id", "some-debt-id");
form.setValue("transfer_group_id", "transfer-123");

// Effect should clear debt_id
// Expected: debt_id becomes undefined when transfer_group_id set
```

### Zero Amount Cannot Link to Debt

```tsx
// Fill form:
// - Amount: ₱0.00
// - Debt: Car Loan

// Click submit
// Expected validation error: "Amount must be greater than ₱0.00 to link to debt"
```

### Paid-Off Debt Warning

```tsx
// Create paid-off debt
await updateDebtStatusFromBalance(debtId, "external"); // Sets to paid_off

// Open transaction form
// Select paid-off debt

// Expected warning:
// "⚠ This debt is already paid off. You can still make a payment if needed."

// Can still submit (soft warning, not error)
```

### Archived Debt Not Shown

```tsx
// Archive a debt
await archiveDebt(debtId, "external");

// Open transaction form
// Check debt selector

// Expected: Archived debt NOT in dropdown
// Only active and paid_off debts shown
```

---

## Part 7: Query Invalidation

### Transaction List Updates

```tsx
// Open transaction list page showing 10 transactions

// Create new transaction with debt link via form

// Expected:
// - Transaction list automatically updates to 11 transactions
// - New transaction appears at top (if sorted by date)
// - No manual refresh needed
```

### Debt List Updates

```tsx
// Open debt detail page showing balance ₱1,000

// Create ₱500 payment via transaction form

// Expected:
// - Debt balance automatically updates to ₱500
// - Payment appears in payment history
// - No manual refresh needed
```

### Multiple Views Update

```tsx
// Open two browser tabs:
// Tab 1: Transaction list
// Tab 2: Debt detail page

// In Tab 1: Create transaction with debt link

// In Tab 2:
// Expected: Debt balance updates when tab focused (or immediately with realtime)
```

---

## Part 8: UI/UX Verification

### Form Layout

```tsx
// Open transaction form

// Expected field order:
// 1. Amount
// 2. Date
// 3. Type (Income/Expense)
// 4. Category
// 5. Account
// 6. Description
// 7. Link to Debt (Optional) ← NEW FIELD
// 8. Balance Preview (if debt selected) ← NEW SECTION

// Debt field should be clearly optional
// Preview should be visually distinct (border/background)
```

### Loading States

```tsx
// Open transaction form

// Expected:
// - Debt selector shows "Loading..." if query pending
// - After load, shows debt options
// - If error, shows error message in dropdown
```

### Success Feedback

```tsx
// Create transaction with debt link

// Expected toast:
// - Title: "Transaction saved and payment applied to Car Loan"
// - Variant: Success (green)
// - Duration: 4-5 seconds

// Create transaction WITHOUT debt link

// Expected toast:
// - Title: "Transaction saved successfully"
// - No mention of debt
```

### Error Feedback

```tsx
// Simulate error in processDebtPayment
vi.mock("@/lib/debts", () => ({
  processDebtPayment: vi.fn().mockRejectedValue(new Error("Network error")),
}));

// Try to create transaction with debt link

// Expected:
// - Error toast: "Failed to save transaction. Please try again."
// - Form stays open (not closed)
// - Can retry submission
```

---

## Part 9: Integration Testing

### Complete Workflow Test

```tsx
// Scenario: User pays off debt completely

// 1. Create debt
const debt = await createExternalDebt({
  name: "Test Debt",
  original_amount_cents: 100000,
  household_id: "h1",
});

// 2. Check initial balance
let balance = await calculateDebtBalance(debt.id, "external");
console.assert(balance === 100000); // ₱1,000

// 3. Make first payment via transaction form (₱600)
await createTransactionWithDebt({
  amount_cents: 60000,
  debt_id: debt.id,
});
balance = await calculateDebtBalance(debt.id, "external");
console.assert(balance === 40000); // ₱400

// 4. Make second payment (₱400 - pays off completely)
await createTransactionWithDebt({
  amount_cents: 40000,
  debt_id: debt.id,
});
balance = await calculateDebtBalance(debt.id, "external");
console.assert(balance === 0); // ₱0

// 5. Verify status changed to paid_off
const updatedDebt = await db.debts.get(debt.id);
console.assert(updatedDebt.status === "paid_off");

// 6. Edit first payment to ₱500 (reopens debt)
await updateTransaction(firstTransactionId, { amount_cents: 50000 });
balance = await calculateDebtBalance(debt.id, "external");
console.assert(balance === 10000); // ₱100 remaining

// 7. Verify status changed back to active
const reopenedDebt = await db.debts.get(debt.id);
console.assert(reopenedDebt.status === "active");
```

---

## Edge Cases

### Edge Case 1: Rapid Amount Changes

```tsx
// Select debt with ₱1,000 balance
// Type amount quickly: 5 → 50 → 500 → 5000

// Expected:
// - Preview updates on each change
// - No flickering or race conditions
// - Final preview shows ₱-4,000 overpayment
```

### Edge Case 2: Select Debt, Then Clear

```tsx
// Select debt: Car Loan
// Preview appears

// Select "None"
// Expected:
// - Preview disappears immediately
// - No errors in console
// - Form can still submit (without debt link)
```

### Edge Case 3: Edit Transaction Multiple Times

```tsx
// Create transaction with ₱500 payment to debt

// Edit 1: Change to ₱300
// Edit 2: Change to ₱400
// Edit 3: Remove debt link
// Edit 4: Re-add debt link with ₱600

// Verify:
// - Each edit creates proper reversals
// - Final balance reflects ₱600 payment
// - Payment history shows complete audit trail
```

### Edge Case 4: Delete Then Recreate

```tsx
// Create transaction with ₱500 payment
// Delete transaction (reversal created)
// Balance restored to ₱1,000

// Create new transaction with same ₱500 payment
// Expected:
// - New payment created (different ID)
// - Balance back to ₱500
// - No confusion with old reversed payment
```

### Edge Case 5: Concurrent Edits (Multi-Device Scenario)

```tsx
// Device A: Create ₱500 payment
// Device B: (offline) Create ₱600 payment to same debt
// Device B: Goes online, syncs

// Expected:
// - Both payments recorded
// - Balance reflects both (₱1,000 - ₱500 - ₱600 = -₱100)
// - Second payment flagged as overpayment
```

---

## Final Checklist

- [ ] Debt selector shows active debts with balances
- [ ] "None" option clears selection
- [ ] Real-time preview shows correct calculations
- [ ] Overpayment warnings display
- [ ] Payoff celebration message shows
- [ ] Transaction create with debt link creates payment
- [ ] Transaction create without debt link works normally
- [ ] Edit amount triggers reversal + new payment
- [ ] Add debt link to existing transaction works
- [ ] Remove debt link reverses payment
- [ ] Change debt link moves payment to new debt
- [ ] Delete transaction reverses payment
- [ ] Transfer cannot link to debt (validated)
- [ ] Zero amount cannot link to debt (validated)
- [ ] Paid-off debt shows warning
- [ ] Archived debt not in selector
- [ ] Query invalidation refreshes UI
- [ ] Success toasts include debt name
- [ ] Error handling works
- [ ] Complete workflow (create → edit → delete) works

**Status**: ✅ Chunk D9 Complete

**Next Chunk**: D10 - Event Sourcing Integration

---

## Performance Verification

### Query Performance

```tsx
// Test with 100 active debts
const debts = await Promise.all(
  Array.from({ length: 100 }, (_, i) =>
    createExternalDebt({
      name: `Debt ${i}`,
      original_amount_cents: 100000,
      household_id: "h1",
    })
  )
);

// Open transaction form
// Expected: Debt selector loads in <500ms
// Dropdown scrolls smoothly with 100 options
```

### Balance Calculation Performance

```tsx
// Test debt with 1000 payments
const debt = await createExternalDebt({
  name: "Heavy Debt",
  original_amount_cents: 10000000,
  household_id: "h1",
});

for (let i = 0; i < 1000; i++) {
  await processDebtPayment({
    transaction_id: `txn-${i}`,
    amount_cents: 10000,
    payment_date: "2025-11-10",
    debt_id: debt.id,
    household_id: "h1",
  });
}

// Select debt in transaction form
// Expected: Balance calculates and displays in <100ms
// Preview updates smoothly as user types
```

---

## Accessibility Verification

### Keyboard Navigation

```tsx
// Tab through transaction form
// Expected tab order:
// ... existing fields ...
// → Debt selector
// → (If debt selected, focus stays in preview area)
// → Submit button

// Arrow keys navigate debt dropdown
// Enter selects debt
// Escape closes dropdown
```

### Screen Reader

```tsx
// Use VoiceOver/NVDA

// Focus debt selector
// Expected announcement:
// "Link to Debt, Optional, Select dropdown, Optionally link this transaction to a debt payment"

// Open dropdown, arrow to debt
// Expected:
// "Car Loan - Balance: ₱1,000.00"

// After selecting debt with preview shown
// Expected (when focus moves to preview):
// "Payment Preview, Current balance: ₱1,000.00, Payment amount: -₱500.00, After payment: ₱500.00"
```
