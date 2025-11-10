# D5 Verification: Payment Processing Core

## Quick Verification (2 minutes)

```bash
npm test payments.test
# Expected: 12+ tests pass
```

---

## Part 1: Basic Payment Processing

### Create Payment

```typescript
import { processDebtPayment } from "@/lib/debts/payments";

const debt = await createExternalDebt({
  name: "Test",
  original_amount_cents: 100000,
  household_id: "h1",
});

const result = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

console.assert(result.payment !== undefined);
console.assert(result.newBalance === 50000);
console.assert(result.wasOverpayment === false);
```

---

## Part 2: Overpayment Detection

### Test Overpayment

```typescript
const result = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 150000, // Exceeds ₱1,000 debt
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

console.assert(result.wasOverpayment === true);
console.assert(result.overpaymentAmount === 50000);
console.assert(result.payment.is_overpayment === true);
console.assert(result.newBalance === -50000); // Negative
```

### Test Payment to Zero-Balance Debt

```typescript
// Pay off debt
await processDebtPayment({ amount_cents: 100000, ... });

// Try another payment (entire amount is overpayment)
const result = await processDebtPayment({
  amount_cents: 50000,
  ...
});

console.assert(result.wasOverpayment === true);
console.assert(result.overpaymentAmount === 50000);  // Full amount
```

---

## Part 3: Status Updates

### Auto Status Change

```typescript
const result = await processDebtPayment({
  amount_cents: 100000,  // Full payoff
  ...
});

console.assert(result.statusChanged === true);
console.assert(result.newStatus === 'paid_off');

const debt = await db.debts.get(debtId);
console.assert(debt?.status === 'paid_off');
console.assert(debt?.closed_at !== undefined);
```

---

## Part 4: Idempotency & Device Tracking

### Verify Idempotency Key Generation

```typescript
const result = await processDebtPayment({...});

// Lamport clock should increment
const meta = await db.meta.get('lamport_clock');
console.assert(meta?.value > 0);
```

### Verify Device ID Tracking

```typescript
const result = await processDebtPayment({...});

console.assert(result.payment.device_id !== undefined);
console.assert(typeof result.payment.device_id === 'string');
```

---

## Part 5: Error Handling

### Archived Debt Rejection

```typescript
await db.debts.update(debtId, { status: 'archived' });

await processDebtPayment({...});
// Expected: Error "Cannot make payment to archived debt"
```

### Negative Amount Rejection

```typescript
await processDebtPayment({ amount_cents: -50000, ... });
// Expected: Error "Payment amount must be positive"
```

---

## Final Checklist

- [ ] Basic payment creation works
- [ ] Overpayment detection accurate
- [ ] Status auto-updates to paid_off
- [ ] Idempotency keys generated
- [ ] Device ID tracked
- [ ] Negative balances supported
- [ ] Archived debt payments blocked
- [ ] All 12+ tests pass

**Status**: ✅ Chunk D5 Complete

**Next Chunk**: D6 - Reversal System
