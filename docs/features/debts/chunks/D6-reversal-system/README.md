# Chunk D6: Reversal System

## At a Glance

- **Time**: 1.5 hours
- **Prerequisites**: D5 (Payment Processing) complete
- **Can Skip**: No - critical for data integrity
- **Depends On**: Payment processing, balance calculation

## What You're Building

Compensating events pattern for handling transaction edits and deletes:

- **Reversal creation**: Generate negative payment records that negate originals
- **Transaction edit handling**: Reverse old payment → create new payment
- **Transaction delete handling**: Reverse payment to restore debt balance
- **Cascading reversals**: Support reversing a reversal (double negative)
- **Immutable audit trail**: Never delete/update payment records
- **Automatic status updates**: Status recalculated after reversals
- **Integration hooks**: Ready for transaction form (D9) and event sourcing (D10)

## Why This Matters

Reversals are the **core of data integrity** in the debt system:

- **Audit trail**: Complete payment history preserved forever
- **Conflict resolution**: Reversals compose cleanly in multi-device scenarios
- **Error recovery**: Mistakes can be reversed without data loss
- **Event sourcing compatibility**: Reversals are natural compensating events
- **Balance accuracy**: Guarantees balance reflects current transaction state
- **User trust**: Users can see exactly what happened and when

This chunk implements the compensating events pattern from debt-implementation.md.

## Before You Start

Verify these prerequisites:

- [ ] **Chunk D5 complete** - Payment processing available
- [ ] **Balance calculation** correctly excludes reversals (from D3)
- [ ] **Status update** works after balance changes (from D3)
- [ ] **Transaction CRUD** exists (legacy code)

**How to verify**:

```typescript
import { processDebtPayment } from "@/lib/debts/payments";
import { calculateDebtBalance } from "@/lib/debts/balance";
import { updateDebtStatusFromBalance } from "@/lib/debts/status";

console.log("Payment:", typeof processDebtPayment === "function");
console.log("Balance:", typeof calculateDebtBalance === "function");
console.log("Status:", typeof updateDebtStatusFromBalance === "function");
```

## What Happens Next

After this chunk:

- Transactions can be edited without breaking debt links
- Deleted transactions automatically reverse their payments
- Complete payment history preserved in immutable log
- Ready for Chunk D7 (Debt UI Components)

## Key Files Created

```
src/
├── lib/
│   └── debts/
│       ├── reversals.ts             # Reversal logic
│       └── __tests__/
│           └── reversals.test.ts    # Reversal tests
└── types/
    └── debt.ts                      # MODIFIED: Add reversal types
```

## Features Included

### Reversal Creation

**reverseDebtPayment()**:

- Takes original payment ID
- Creates negative payment record
- Sets `is_reversal: true` and `reverses_payment_id`
- Updates debt status automatically
- Returns reversal record

### Transaction Edit Handling

**handleTransactionEdit()**:

- Detects if transaction was linked to debt
- Reverses old payment (if exists)
- Creates new payment with updated amount
- Handles debt link changes (add/remove/change)
- Updates status based on new balance

### Transaction Delete Handling

**handleTransactionDelete()**:

- Finds payment linked to transaction
- Creates reversal to restore balance
- Preserves complete audit trail
- Updates debt status

### Cascading Reversals

**Supports double negatives**:

- Reversing a reversal is allowed
- Creates positive payment that offsets the reversal
- Use case: Undo an accidental reversal
- Balance calculation handles nested reversals correctly

## Related Documentation

- **Reversal System**: `debt-implementation.md` lines 303-408 (compensating events)
- **Balance Calculation**: `debt-implementation.md` lines 104-140 (reversal exclusion)
- **Cascading Reversals**: `debt-implementation.md` lines 368-408 (double negative handling)
- **Decisions**:
  - #5: Compensating events over updates (DEBT-DECISIONS.md lines 243-281)
  - #8: Cascading reversal support (DEBT-DECISIONS.md lines 348-389)

## Technical Stack

- **Dexie.js**: Reversal persistence
- **TypeScript**: Type-safe reversal operations
- **nanoid**: Reversal ID generation
- **Lamport clock**: Idempotency keys for reversals

## Design Patterns

### Compensating Events Pattern

```typescript
// ANTI-PATTERN: Update or delete payment
await db.debtPayments.delete(paymentId); // ❌ Lost audit trail

// CORRECT: Create compensating event
const reversal = {
  id: nanoid(),
  amount_cents: -originalPayment.amount_cents, // Negative!
  is_reversal: true,
  reverses_payment_id: originalPayment.id,
  // ... other fields
};
await db.debtPayments.add(reversal); // ✅ Immutable history
```

**Why**: Preserves complete audit trail, enables event sourcing, composes cleanly.

### Edit-as-Reverse-and-Create Pattern

```typescript
async function handleTransactionEdit(transactionId, newAmount) {
  // 1. Find original payment
  const oldPayment = await db.debtPayments.where("transaction_id").equals(transactionId).first();

  if (oldPayment) {
    // 2. Reverse old payment
    await reverseDebtPayment(oldPayment.id);

    // 3. Create new payment with updated amount
    await processDebtPayment({
      transaction_id: transactionId,
      amount_cents: newAmount,
      debt_id: oldPayment.debt_id,
      // ...
    });
  }
}
```

**Why**: Audit trail shows old amount → reversal → new amount. Clear change history.

### Cascading Reversal Pattern

```typescript
async function reverseDebtPayment(paymentId) {
  const original = await db.debtPayments.get(paymentId);

  // If reversing a reversal, create positive payment
  const isReversingReversal = original.is_reversal === true;

  const reversal = {
    id: nanoid(),
    amount_cents: isReversingReversal
      ? Math.abs(original.amount_cents) // Positive (double negative)
      : -original.amount_cents, // Negative
    is_reversal: true,
    reverses_payment_id: paymentId,
    // ...
  };

  await db.debtPayments.add(reversal);
}
```

**Why**: Allows undoing reversals. Handles nested reversals correctly.

## Critical Concepts

**Reversal Amount Sign**: When reversing a normal payment (positive), create negative amount. When reversing a reversal (negative), create positive amount (double negative). This ensures balance is always correct.

**Balance Calculation Integration**: The balance calculation from D3 MUST exclude both:

1. Payments with `is_reversal: true` (don't count the reversal itself)
2. Payments with their ID in `reverses_payment_id` of another record (don't count reversed payments)

This was already implemented in D3, so reversals work seamlessly.

**Reversal Timing**: Reversals happen **before** creating new payments. This ensures balance is accurate at each step:

1. Original: Balance = ₱100
2. After reversal: Balance = ₱200 (debt restored)
3. After new payment: Balance = ₱150 (new amount applied)

**Idempotency Keys**: Reversals generate their own idempotency keys, separate from the original payment. Format: `${deviceId}-debt_payment-${reversalId}-${lamportClock}`

**Transaction-Payment Linking**: The `transaction_id` field on payments enables finding which payment to reverse when a transaction is edited/deleted.

## Reversal Scenarios

### Scenario 1: Transaction Amount Edited

**Initial state**:

- Transaction: ₱500 linked to Debt A
- Debt A balance: ₱1,000 - ₱500 = ₱500

**Edit transaction to ₱300**:

1. Find payment with transaction_id
2. Reverse payment: Create -₱500 reversal
3. Balance after reversal: ₱1,000 - ₱0 = ₱1,000 (restored)
4. Create new payment: ₱300
5. Final balance: ₱1,000 - ₱300 = ₱700

**Audit trail**:

- Original payment: +₱500
- Reversal: -₱500 (reverses original)
- New payment: +₱300
- Net effect: ₱300 paid

### Scenario 2: Transaction Deleted

**Initial state**:

- Transaction: ₱500 linked to Debt B
- Debt B balance: ₱1,000 - ₱500 = ₱500

**Delete transaction**:

1. Find payment with transaction_id
2. Create reversal: -₱500
3. Final balance: ₱1,000 - ₱0 = ₱1,000 (restored)
4. Debt status may revert from paid_off → active

**Audit trail**:

- Original payment: +₱500
- Reversal: -₱500 (transaction deleted)
- Net effect: ₱0 paid

### Scenario 3: Debt Link Changed

**Initial state**:

- Transaction: ₱500 linked to Debt C
- User edits transaction to link to Debt D instead

**Handle debt link change**:

1. Reverse payment on Debt C: -₱500
2. Create new payment on Debt D: +₱500
3. Debt C balance increases by ₱500
4. Debt D balance decreases by ₱500

**Audit trail**:

- Debt C: Original payment +₱500, reversal -₱500 (net ₱0)
- Debt D: New payment +₱500 (net ₱500)

### Scenario 4: Cascading Reversal (Undo Mistake)

**Initial state**:

- Payment: ₱500 on Debt E
- User accidentally reverses it
- Reversal created: -₱500
- Balance restored to ₱1,000

**Undo the reversal**:

1. Reverse the reversal payment
2. Create positive ₱500 payment (double negative)
3. Balance: ₱1,000 - ₱500 = ₱500 (back to original)

**Audit trail**:

- Original payment: +₱500
- First reversal: -₱500 (reverses original)
- Second reversal: +₱500 (reverses first reversal)
- Net effect: ₱500 paid (same as start)

## Error Handling

**Validation Errors**:

- "Payment not found"
- "Payment already reversed" (idempotent - return existing reversal)
- "Cannot reverse payment on archived debt" (soft restriction)

**Warnings** (not errors):

- "Reversing payment will change debt status from paid_off to active"

**Critical**: Reversals are always allowed even if they create overpayments or negative balances. The system trusts user intent.

## Integration Points

### Transaction Form (D9)

```typescript
// When user edits transaction with debt link
async function onTransactionUpdate(transactionId, updates) {
  if (updates.amount_cents || updates.debt_id) {
    await handleTransactionEdit(transactionId, updates);
  }
}

// When user deletes transaction with debt link
async function onTransactionDelete(transactionId) {
  await handleTransactionDelete(transactionId);
}
```

### Event Sourcing (D10)

```typescript
// Reversals generate events
const event = {
  entityType: "debt_payment",
  entityId: reversalId,
  op: "create", // Reversals are creates, not deletes!
  payload: {
    is_reversal: true,
    reverses_payment_id: originalPaymentId,
    amount_cents: -originalAmount,
  },
  // ... idempotency key, lamport clock, etc.
};
```

## Performance Considerations

**Reversal Lookup**: When editing a transaction, need to find its payment efficiently:

- Index on `debt_payments.transaction_id` (already exists from D1)
- O(log n) lookup by transaction ID

**Balance Calculation**: Reversal exclusion is O(n) but efficient:

- Single pass to identify reversed payment IDs
- Single pass to filter valid payments
- Total: O(2n) → O(n)

**Cascading Depth**: No limit on reversal depth, but UI should warn on deep cascades (>2 levels).

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
