# D6 Verification: Reversal System

## Quick Verification (2 minutes)

```bash
npm test src/lib/debts/__tests__/reversals.test.ts
# Expected: 15+ tests pass
```

---

## Part 1: Basic Reversal

### Create and Reverse Payment

```typescript
import {
  createExternalDebt,
  processDebtPayment,
  reverseDebtPayment,
  calculateDebtBalance,
} from "@/lib/debts";

const debt = await createExternalDebt({
  name: "Test Debt",
  original_amount_cents: 100000,
  household_id: "h1",
});

const payment = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

console.assert((await calculateDebtBalance(debt.id, "external")) === 50000);

const result = await reverseDebtPayment({ payment_id: payment.payment.id });

console.assert(result.reversal.amount_cents === -50000);
console.assert(result.reversal.is_reversal === true);
console.assert(result.reversal.reverses_payment_id === payment.payment.id);
console.assert(result.newBalance === 100000); // Restored
```

---

## Part 2: Cascading Reversals

### Reverse a Reversal (Double Negative)

```typescript
const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

const payment = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

// First reversal
const rev1 = await reverseDebtPayment({ payment_id: payment.payment.id });
console.assert(rev1.reversal.amount_cents === -50000);
console.assert(rev1.newBalance === 100000);

// Second reversal (reverse the reversal)
const rev2 = await reverseDebtPayment({ payment_id: rev1.reversal.id });
console.assert(rev2.reversal.amount_cents === 50000); // Positive!
console.assert(rev2.newBalance === 50000); // Back to original
```

---

## Part 3: Idempotency

### Reversing Twice Returns Same Reversal

```typescript
const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

const payment = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

const result1 = await reverseDebtPayment({ payment_id: payment.payment.id });
const result2 = await reverseDebtPayment({ payment_id: payment.payment.id });

console.assert(result1.reversal.id === result2.reversal.id);
console.assert(result2.statusChanged === false); // No second status change
```

---

## Part 4: Transaction Edit Handling

### Edit Transaction Amount

```typescript
import { handleTransactionEdit } from "@/lib/debts";

const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

console.assert((await calculateDebtBalance(debt.id, "external")) === 50000);

// Edit amount from ₱500 to ₱300
const result = await handleTransactionEdit({
  transaction_id: "txn-1",
  new_amount_cents: 30000,
  new_debt_id: debt.id,
  payment_date: "2025-11-10",
});

console.assert(result.reversalCreated === true);
console.assert(result.paymentCreated === true);
console.assert(result.operations.length === 2);
console.assert((await calculateDebtBalance(debt.id, "external")) === 70000);
```

### Remove Debt Link from Transaction

```typescript
const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

// Remove debt link (set amount to 0 or undefined)
const result = await handleTransactionEdit({
  transaction_id: "txn-1",
  new_amount_cents: 0,
  payment_date: "2025-11-10",
});

console.assert(result.reversalCreated === true);
console.assert(result.paymentCreated === false);
console.assert((await calculateDebtBalance(debt.id, "external")) === 100000);
```

### Change Debt Link to Different Debt

```typescript
const debt1 = await createExternalDebt({
  name: "Debt 1",
  original_amount_cents: 100000,
  household_id: "h1",
});

const debt2 = await createExternalDebt({
  name: "Debt 2",
  original_amount_cents: 200000,
  household_id: "h1",
});

await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt1.id,
  household_id: "h1",
});

// Change link from debt1 to debt2
const result = await handleTransactionEdit({
  transaction_id: "txn-1",
  new_amount_cents: 50000,
  new_debt_id: debt2.id,
  payment_date: "2025-11-10",
});

console.assert(result.operations.length === 2);

const balance1 = await calculateDebtBalance(debt1.id, "external");
const balance2 = await calculateDebtBalance(debt2.id, "external");

console.assert(balance1 === 100000); // Debt 1 restored
console.assert(balance2 === 150000); // Debt 2 reduced
```

---

## Part 5: Transaction Delete Handling

### Delete Transaction with Debt Link

```typescript
import { handleTransactionDelete } from "@/lib/debts";

const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

const payment = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

console.assert((await calculateDebtBalance(debt.id, "external")) === 50000);

const result = await handleTransactionDelete({
  transaction_id: "txn-1",
});

console.assert(result !== undefined);
console.assert(result.reversal.amount_cents === -50000);
console.assert(result.newBalance === 100000);
```

### Delete Transaction with No Debt Link

```typescript
const result = await handleTransactionDelete({
  transaction_id: "nonexistent-txn",
});

console.assert(result === undefined); // No payment to reverse
```

---

## Part 6: Status Updates After Reversal

### Reversal Changes Status from paid_off to active

```typescript
const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Pay off completely
const payment = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 100000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

const debtBefore = await db.debts.get(debt.id);
console.assert(debtBefore?.status === "paid_off");

// Reverse payment
const result = await reverseDebtPayment({ payment_id: payment.payment.id });

console.assert(result.statusChanged === true);
console.assert(result.newStatus === "active");

const debtAfter = await db.debts.get(debt.id);
console.assert(debtAfter?.status === "active");
```

---

## Part 7: Audit Trail Verification

### Payment History Shows Complete Trail

```typescript
const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Original payment
const payment = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

// Edit (creates reversal + new payment)
await handleTransactionEdit({
  transaction_id: "txn-1",
  new_amount_cents: 30000,
  new_debt_id: debt.id,
  payment_date: "2025-11-10",
});

// Get all payment records
const allPayments = await db.debtPayments.where("debt_id").equals(debt.id).toArray();

console.assert(allPayments.length === 3, "Three records");

// Verify audit trail
const original = allPayments.find((p) => !p.is_reversal && p.amount_cents === 50000);
const reversal = allPayments.find((p) => p.is_reversal && p.amount_cents === -50000);
const newPayment = allPayments.find((p) => !p.is_reversal && p.amount_cents === 30000);

console.assert(original !== undefined, "Original preserved");
console.assert(reversal !== undefined, "Reversal recorded");
console.assert(newPayment !== undefined, "New payment created");
console.assert(reversal.reverses_payment_id === original.id, "Reversal links to original");
```

---

## Part 8: Helper Functions

### isPaymentReversed

```typescript
import { isPaymentReversed } from "@/lib/debts";

const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

const payment = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

console.assert((await isPaymentReversed(payment.payment.id)) === false);

await reverseDebtPayment({ payment_id: payment.payment.id });

console.assert((await isPaymentReversed(payment.payment.id)) === true);
```

### getPaymentReversals

```typescript
import { getPaymentReversals } from "@/lib/debts";

const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

const payment = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

await reverseDebtPayment({ payment_id: payment.payment.id });

const reversals = await getPaymentReversals(payment.payment.id);

console.assert(reversals.length === 1);
console.assert(reversals[0].is_reversal === true);
console.assert(reversals[0].reverses_payment_id === payment.payment.id);
```

---

## Edge Cases

### Edge Case 1: Reverse Overpayment

```typescript
const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Overpayment
const payment = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 150000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

console.assert(payment.wasOverpayment === true);
console.assert((await calculateDebtBalance(debt.id, "external")) === -50000);

// Reverse overpayment
const result = await reverseDebtPayment({ payment_id: payment.payment.id });

console.assert(result.reversal.amount_cents === -150000);
console.assert(result.newBalance === 100000); // Restored
```

### Edge Case 2: Multiple Edits to Same Transaction

```typescript
const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Original payment
await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

// First edit
await handleTransactionEdit({
  transaction_id: "txn-1",
  new_amount_cents: 30000,
  new_debt_id: debt.id,
  payment_date: "2025-11-10",
});

// Second edit
await handleTransactionEdit({
  transaction_id: "txn-1",
  new_amount_cents: 40000,
  new_debt_id: debt.id,
  payment_date: "2025-11-10",
});

// Balance should reflect final amount
const balance = await calculateDebtBalance(debt.id, "external");
console.assert(balance === 60000); // 100000 - 40000
```

### Edge Case 3: Reverse Payment on Archived Debt

```typescript
const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

const payment = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

// Archive debt
await db.debts.update(debt.id, { status: "archived" });

// Reversal should still work (soft restriction)
const result = await reverseDebtPayment({ payment_id: payment.payment.id });

console.assert(result.reversal !== undefined);
console.assert(result.statusChanged === true);
console.assert(result.newStatus === "active"); // Unarchives!
```

---

## Final Checklist

- [ ] Basic reversal creates negative payment
- [ ] Balance restored after reversal
- [ ] Cascading reversals work (double negative)
- [ ] Idempotency: reversing twice returns same record
- [ ] Transaction edit creates reversal + new payment
- [ ] Transaction delete creates reversal
- [ ] Debt link changes handled correctly
- [ ] Status updates after reversal
- [ ] Audit trail preserved completely
- [ ] Helper functions work (isPaymentReversed, getPaymentReversals)
- [ ] All 15+ tests pass

**Status**: ✅ Chunk D6 Complete

**Next Chunk**: D7 - Debt UI Components

---

## Integration Verification

Test integration with transaction form (manual test in dev environment):

```typescript
// In transaction form edit handler
async function onTransactionUpdate(transactionId, updates) {
  // Update transaction
  await db.transactions.update(transactionId, updates);

  // Handle debt payment changes
  if (updates.amount_cents !== undefined || updates.debt_id !== undefined) {
    await handleTransactionEdit({
      transaction_id: transactionId,
      new_amount_cents: updates.amount_cents,
      new_debt_id: updates.debt_id,
      payment_date: updates.date,
    });
  }

  console.log("Transaction and debt payment updated");
}

// In transaction form delete handler
async function onTransactionDelete(transactionId) {
  // Handle debt payment reversal first
  await handleTransactionDelete({ transaction_id: transactionId });

  // Delete transaction
  await db.transactions.delete(transactionId);

  console.log("Transaction deleted, payment reversed");
}
```

**Expected behavior**:

- Editing transaction amount updates debt balance
- Removing debt link restores balance
- Changing debt link moves payment to new debt
- Deleting transaction restores debt balance
- All changes preserve audit trail
