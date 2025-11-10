# D3 Verification: Balance Calculation & Status Logic

## Quick Verification (2 minutes)

Run these tests to confirm success:

```bash
# Run all debt tests
npm test src/lib/debts

# Expected output:
# ✓ balance.test.ts (8 tests passed)
# ✓ status.test.ts (11 tests passed)
#
# Test Files  2 passed (2)
#      Tests  19 passed (19)
```

**If all tests pass**, proceed to detailed verification below.

---

## Part 1: Balance Calculation Testing

### 1.1 No Payments Scenario

```typescript
import { db } from "@/lib/dexie/db";
import { calculateDebtBalance } from "@/lib/debts/balance";

// Create debt with no payments
await db.debts.add({
  id: "test-1",
  household_id: "household-1",
  name: "No Payments Test",
  original_amount_cents: 50000, // ₱500
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const balance = await calculateDebtBalance("test-1", "external");
console.log("Balance:", balance);
// Expected: 50000 (full balance)

// Cleanup
await db.debts.delete("test-1");
```

### 1.2 Single Payment Scenario

```typescript
// Add debt
await db.debts.add({
  id: "test-2",
  household_id: "household-1",
  name: "Single Payment Test",
  original_amount_cents: 100000, // ₱1,000
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Add payment
await db.debtPayments.add({
  id: "payment-1",
  household_id: "household-1",
  debt_id: "test-2",
  transaction_id: "txn-1",
  amount_cents: 30000, // ₱300
  payment_date: "2025-11-10",
  device_id: "device-1",
  is_reversal: false,
  created_at: new Date().toISOString(),
});

const balance = await calculateDebtBalance("test-2", "external");
console.log("Balance after ₱300 payment:", balance);
// Expected: 70000 (₱1,000 - ₱300 = ₱700)

// Cleanup
await db.debtPayments.delete("payment-1");
await db.debts.delete("test-2");
```

### 1.3 Multiple Payments Scenario

```typescript
await db.debts.add({
  id: "test-3",
  household_id: "household-1",
  name: "Multiple Payments",
  original_amount_cents: 100000,
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Add 3 payments
await db.debtPayments.bulkAdd([
  {
    id: "payment-1",
    household_id: "household-1",
    debt_id: "test-3",
    transaction_id: "txn-1",
    amount_cents: 20000,
    payment_date: "2025-11-01",
    device_id: "device-1",
    is_reversal: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "payment-2",
    household_id: "household-1",
    debt_id: "test-3",
    transaction_id: "txn-2",
    amount_cents: 30000,
    payment_date: "2025-11-05",
    device_id: "device-1",
    is_reversal: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "payment-3",
    household_id: "household-1",
    debt_id: "test-3",
    transaction_id: "txn-3",
    amount_cents: 15000,
    payment_date: "2025-11-10",
    device_id: "device-1",
    is_reversal: false,
    created_at: new Date().toISOString(),
  },
]);

const balance = await calculateDebtBalance("test-3", "external");
console.log("Balance after 3 payments:", balance);
// Expected: 35000 (₱1,000 - ₱200 - ₱300 - ₱150 = ₱350)

// Cleanup
await db.debtPayments.where("debt_id").equals("test-3").delete();
await db.debts.delete("test-3");
```

### 1.4 Reversal Scenario (Critical Test)

```typescript
await db.debts.add({
  id: "test-4",
  household_id: "household-1",
  name: "Reversal Test",
  original_amount_cents: 100000,
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Add original payment
await db.debtPayments.add({
  id: "payment-1",
  household_id: "household-1",
  debt_id: "test-4",
  transaction_id: "txn-1",
  amount_cents: 40000, // ₱400
  payment_date: "2025-11-01",
  device_id: "device-1",
  is_reversal: false,
  created_at: new Date().toISOString(),
});

// Check balance after payment
let balance = await calculateDebtBalance("test-4", "external");
console.log("Balance after payment:", balance);
// Expected: 60000 (₱600)

// Add reversal
await db.debtPayments.add({
  id: "reversal-1",
  household_id: "household-1",
  debt_id: "test-4",
  transaction_id: "txn-1",
  amount_cents: -40000, // Negative (reversal)
  payment_date: "2025-11-02",
  device_id: "device-1",
  is_reversal: true,
  reverses_payment_id: "payment-1",
  adjustment_reason: "Transaction edited",
  created_at: new Date().toISOString(),
});

// Check balance after reversal
balance = await calculateDebtBalance("test-4", "external");
console.log("Balance after reversal:", balance);
// Expected: 100000 (back to full balance - both payment and reversal excluded)

// Verify calculation logic
const payments = await db.debtPayments.where("debt_id").equals("test-4").toArray();
console.log("Total payment records:", payments.length); // 2
console.log(
  "Reversal record exists:",
  payments.some((p) => p.is_reversal)
); // true
console.log("Reversed payment ID:", payments.find((p) => p.is_reversal)?.reverses_payment_id); // 'payment-1'

// Cleanup
await db.debtPayments.where("debt_id").equals("test-4").delete();
await db.debts.delete("test-4");
```

### 1.5 Overpayment Scenario

```typescript
await db.debts.add({
  id: "test-5",
  household_id: "household-1",
  name: "Overpayment Test",
  original_amount_cents: 100000, // ₱1,000
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Overpay by ₱500
await db.debtPayments.add({
  id: "payment-1",
  household_id: "household-1",
  debt_id: "test-5",
  transaction_id: "txn-1",
  amount_cents: 150000, // ₱1,500
  payment_date: "2025-11-10",
  device_id: "device-1",
  is_reversal: false,
  is_overpayment: true,
  overpayment_amount: 50000,
  created_at: new Date().toISOString(),
});

const balance = await calculateDebtBalance("test-5", "external");
console.log("Balance after overpayment:", balance);
// Expected: -50000 (negative balance = overpaid by ₱500)

console.assert(balance < 0, "Balance should be negative for overpayment");
console.assert(Math.abs(balance) === 50000, "Overpayment amount should be ₱500");

// Cleanup
await db.debtPayments.delete("payment-1");
await db.debts.delete("test-5");
```

### 1.6 Detailed Balance Breakdown

```typescript
import { calculateDebtBalanceWithDetails } from "@/lib/debts/balance";

await db.debts.add({
  id: "test-6",
  household_id: "household-1",
  name: "Details Test",
  original_amount_cents: 200000, // ₱2,000
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Add 2 payments and 1 reversal
await db.debtPayments.bulkAdd([
  {
    id: "payment-1",
    household_id: "household-1",
    debt_id: "test-6",
    transaction_id: "txn-1",
    amount_cents: 50000,
    payment_date: "2025-11-01",
    device_id: "device-1",
    is_reversal: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "payment-2",
    household_id: "household-1",
    debt_id: "test-6",
    transaction_id: "txn-2",
    amount_cents: 75000,
    payment_date: "2025-11-05",
    device_id: "device-1",
    is_reversal: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "reversal-1",
    household_id: "household-1",
    debt_id: "test-6",
    transaction_id: "txn-1",
    amount_cents: -50000,
    payment_date: "2025-11-06",
    device_id: "device-1",
    is_reversal: true,
    reverses_payment_id: "payment-1",
    created_at: new Date().toISOString(),
  },
]);

const details = await calculateDebtBalanceWithDetails("test-6", "external");

console.log("Details:", details);
// Expected:
// {
//   original_amount_cents: 200000,
//   total_paid_cents: 75000,  // Only payment-2 counts
//   current_balance_cents: 125000,  // ₱2,000 - ₱750 = ₱1,250
//   payment_count: 1,  // payment-2 only (payment-1 reversed)
//   reversal_count: 1,
//   is_overpaid: false,
//   overpayment_amount_cents: 0,
// }

console.assert(details.total_paid_cents === 75000, "Only valid payment counted");
console.assert(details.payment_count === 1, "Reversed payment not counted");
console.assert(details.reversal_count === 1, "Reversal counted separately");

// Cleanup
await db.debtPayments.where("debt_id").equals("test-6").delete();
await db.debts.delete("test-6");
```

---

## Part 2: Status Transition Testing

### 2.1 Active → Paid Off Transition

```typescript
import { updateDebtStatusFromBalance } from "@/lib/debts/status";

// Create active debt
await db.debts.add({
  id: "status-1",
  household_id: "household-1",
  name: "Status Transition Test",
  original_amount_cents: 50000, // ₱500
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Pay off fully
await db.debtPayments.add({
  id: "payment-1",
  household_id: "household-1",
  debt_id: "status-1",
  transaction_id: "txn-1",
  amount_cents: 50000, // Full payment
  payment_date: "2025-11-10",
  device_id: "device-1",
  is_reversal: false,
  created_at: new Date().toISOString(),
});

// Update status
const changed = await updateDebtStatusFromBalance("status-1", "external");
console.log("Status changed:", changed); // true

const debt = await db.debts.get("status-1");
console.log("New status:", debt?.status); // 'paid_off'
console.log("Closed at:", debt?.closed_at); // Timestamp defined

console.assert(debt?.status === "paid_off", "Should transition to paid_off");
console.assert(debt?.closed_at !== undefined, "Should set closed_at timestamp");

// Cleanup
await db.debtPayments.delete("payment-1");
await db.debts.delete("status-1");
```

### 2.2 Paid Off → Active Transition (Reversal)

```typescript
// Create paid-off debt
await db.debts.add({
  id: "status-2",
  household_id: "household-1",
  name: "Reversal Reactivation",
  original_amount_cents: 50000,
  status: "paid_off",
  closed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Add original payment
await db.debtPayments.add({
  id: "payment-1",
  household_id: "household-1",
  debt_id: "status-2",
  transaction_id: "txn-1",
  amount_cents: 50000,
  payment_date: "2025-11-01",
  device_id: "device-1",
  is_reversal: false,
  created_at: new Date().toISOString(),
});

// Add reversal
await db.debtPayments.add({
  id: "reversal-1",
  household_id: "household-1",
  debt_id: "status-2",
  transaction_id: "txn-1",
  amount_cents: -50000,
  payment_date: "2025-11-02",
  device_id: "device-1",
  is_reversal: true,
  reverses_payment_id: "payment-1",
  created_at: new Date().toISOString(),
});

// Update status
const changed = await updateDebtStatusFromBalance("status-2", "external");
console.log("Status changed:", changed); // true

const debt = await db.debts.get("status-2");
console.log("New status:", debt?.status); // 'active'
console.log("Closed at cleared:", debt?.closed_at === null); // true

console.assert(debt?.status === "active", "Should reactivate to active");
console.assert(debt?.closed_at === null, "Should clear closed_at");

// Cleanup
await db.debtPayments.where("debt_id").equals("status-2").delete();
await db.debts.delete("status-2");
```

### 2.3 Archived Status Preserved (Terminal State)

```typescript
// Create archived debt
await db.debts.add({
  id: "status-3",
  household_id: "household-1",
  name: "Archived Terminal",
  original_amount_cents: 50000,
  status: "archived",
  closed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Try to update status (should not change)
const changed = await updateDebtStatusFromBalance("status-3", "external");
console.log("Status changed:", changed); // false

const debt = await db.debts.get("status-3");
console.log("Status still archived:", debt?.status === "archived"); // true

console.assert(changed === false, "Archived status should not auto-update");
console.assert(debt?.status === "archived", "Status should remain archived");

// Cleanup
await db.debts.delete("status-3");
```

### 2.4 Overpayment Status (Negative Balance → Paid Off)

```typescript
await db.debts.add({
  id: "status-4",
  household_id: "household-1",
  name: "Overpayment Status",
  original_amount_cents: 50000,
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Overpay
await db.debtPayments.add({
  id: "payment-1",
  household_id: "household-1",
  debt_id: "status-4",
  transaction_id: "txn-1",
  amount_cents: 75000, // Overpaid by ₱250
  payment_date: "2025-11-10",
  device_id: "device-1",
  is_reversal: false,
  is_overpayment: true,
  overpayment_amount: 25000,
  created_at: new Date().toISOString(),
});

const changed = await updateDebtStatusFromBalance("status-4", "external");

const debt = await db.debts.get("status-4");
const balance = await calculateDebtBalance("status-4", "external");

console.log("Balance:", balance); // -25000 (overpaid)
console.log("Status:", debt?.status); // 'paid_off'

console.assert(balance < 0, "Balance should be negative");
console.assert(debt?.status === "paid_off", "Status should be paid_off even when overpaid");

// Cleanup
await db.debtPayments.delete("payment-1");
await db.debts.delete("status-4");
```

---

## Part 3: Edge Case Testing

### 3.1 Concurrent Overpayments (Offline Scenario)

```typescript
// Scenario: Two devices both pay full balance while offline
await db.debts.add({
  id: "edge-1",
  household_id: "household-1",
  name: "Concurrent Overpayments",
  original_amount_cents: 100000, // ₱1,000
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Device A pays full balance
await db.debtPayments.add({
  id: "payment-A",
  household_id: "household-1",
  debt_id: "edge-1",
  transaction_id: "txn-A",
  amount_cents: 100000,
  payment_date: "2025-11-10",
  device_id: "device-A",
  is_reversal: false,
  created_at: "2025-11-10T10:00:00Z",
});

// Device B pays full balance (doesn't know about A's payment)
await db.debtPayments.add({
  id: "payment-B",
  household_id: "household-1",
  debt_id: "edge-1",
  transaction_id: "txn-B",
  amount_cents: 100000,
  payment_date: "2025-11-10",
  device_id: "device-B",
  is_reversal: false,
  is_overpayment: true, // Marked during sync
  overpayment_amount: 100000,
  created_at: "2025-11-10T10:05:00Z",
});

const balance = await calculateDebtBalance("edge-1", "external");
console.log("Balance after concurrent payments:", balance);
// Expected: -100000 (overpaid by ₱1,000)

const details = await calculateDebtBalanceWithDetails("edge-1", "external");
console.log("Total paid:", details.total_paid_cents); // 200000
console.log("Payment count:", details.payment_count); // 2
console.log("Is overpaid:", details.is_overpaid); // true
console.log("Overpayment amount:", details.overpayment_amount_cents); // 100000

// Cleanup
await db.debtPayments.where("debt_id").equals("edge-1").delete();
await db.debts.delete("edge-1");
```

### 3.2 Multiple Reversals

```typescript
await db.debts.add({
  id: "edge-2",
  household_id: "household-1",
  name: "Multiple Reversals",
  original_amount_cents: 100000,
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Add 3 payments
await db.debtPayments.bulkAdd([
  {
    id: "p1",
    household_id: "household-1",
    debt_id: "edge-2",
    transaction_id: "t1",
    amount_cents: 20000,
    payment_date: "2025-11-01",
    device_id: "d1",
    is_reversal: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "p2",
    household_id: "household-1",
    debt_id: "edge-2",
    transaction_id: "t2",
    amount_cents: 30000,
    payment_date: "2025-11-02",
    device_id: "d1",
    is_reversal: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "p3",
    household_id: "household-1",
    debt_id: "edge-2",
    transaction_id: "t3",
    amount_cents: 25000,
    payment_date: "2025-11-03",
    device_id: "d1",
    is_reversal: false,
    created_at: new Date().toISOString(),
  },
]);

// Reverse first and third payments
await db.debtPayments.bulkAdd([
  {
    id: "r1",
    household_id: "household-1",
    debt_id: "edge-2",
    transaction_id: "t1",
    amount_cents: -20000,
    payment_date: "2025-11-04",
    device_id: "d1",
    is_reversal: true,
    reverses_payment_id: "p1",
    created_at: new Date().toISOString(),
  },
  {
    id: "r3",
    household_id: "household-1",
    debt_id: "edge-2",
    transaction_id: "t3",
    amount_cents: -25000,
    payment_date: "2025-11-05",
    device_id: "d1",
    is_reversal: true,
    reverses_payment_id: "p3",
    created_at: new Date().toISOString(),
  },
]);

const balance = await calculateDebtBalance("edge-2", "external");
console.log("Balance with multiple reversals:", balance);
// Expected: 70000 (₱1,000 - ₱300 = ₱700, p1 and p3 reversed)

const details = await calculateDebtBalanceWithDetails("edge-2", "external");
console.log("Valid payments:", details.payment_count); // 1 (only p2)
console.log("Reversals:", details.reversal_count); // 2

// Cleanup
await db.debtPayments.where("debt_id").equals("edge-2").delete();
await db.debts.delete("edge-2");
```

---

## Part 4: Performance Testing

### 4.1 Large Payment History

```typescript
// Create debt
await db.debts.add({
  id: "perf-1",
  household_id: "household-1",
  name: "Performance Test",
  original_amount_cents: 1000000, // ₱10,000
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Add 100 payments
const payments = Array.from({ length: 100 }, (_, i) => ({
  id: `payment-${i}`,
  household_id: "household-1",
  debt_id: "perf-1",
  transaction_id: `txn-${i}`,
  amount_cents: 5000,
  payment_date: "2025-11-10",
  device_id: "device-1",
  is_reversal: false,
  created_at: new Date().toISOString(),
}));

await db.debtPayments.bulkAdd(payments);

// Measure performance
console.time("Calculate balance with 100 payments");
const balance = await calculateDebtBalance("perf-1", "external");
console.timeEnd("Calculate balance with 100 payments");
// Expected: < 20ms

console.log("Balance:", balance); // 500000 (₱10,000 - 100×₱50 = ₱5,000)

// Cleanup
await db.debtPayments.where("debt_id").equals("perf-1").delete();
await db.debts.delete("perf-1");
```

**Performance Targets**:

- 100 payments: < 20ms
- 1000 payments: < 100ms
- 10000 payments: < 500ms

---

## Troubleshooting

### Issue: Balance calculation returns wrong value

**Debug Steps**:

```typescript
const debtId = "your-debt-id";
const payments = await db.debtPayments.where("debt_id").equals(debtId).toArray();

console.log("Total payments:", payments.length);
console.log("Reversals:", payments.filter((p) => p.is_reversal).length);
console.log(
  "Reversed IDs:",
  payments.filter((p) => p.reverses_payment_id).map((p) => p.reverses_payment_id)
);

// Check each payment
for (const p of payments) {
  console.log(
    `${p.id}: ${p.amount_cents} (reversal: ${p.is_reversal}, reverses: ${p.reverses_payment_id})`
  );
}
```

### Issue: Status not updating after payment

**Cause**: `updateDebtStatusFromBalance()` not called

**Solution**:

```typescript
// After adding/deleting payments, always update status
await db.debtPayments.add(payment);
await updateDebtStatusFromBalance(debtId, type);
```

### Issue: Overpayment not detected

**Check**:

```typescript
const details = await calculateDebtBalanceWithDetails(debtId, type);
console.log("Is overpaid:", details.is_overpaid);
console.log("Overpayment amount:", details.overpayment_amount_cents);
console.log("Current balance:", details.current_balance_cents);

// If balance is negative but is_overpaid is false, check calculation logic
```

### Issue: Archived debt status changed

**Verify**:

```typescript
const debt = await db.debts.get(debtId);
console.log("Status:", debt?.status);

// Archived should NEVER auto-update
if (debt?.status !== "archived") {
  console.error("BUG: Archived status changed!");
}
```

---

## Final Checklist

Before moving to Chunk D4:

- [ ] All 19+ unit tests pass
- [ ] Balance calculation works for all scenarios
- [ ] Reversal filtering excludes both reversal AND reversed payments
- [ ] Negative balances supported (overpayments)
- [ ] Status auto-transitions work (active ↔ paid_off)
- [ ] Archived status preserved (terminal)
- [ ] `closed_at` timestamp set/cleared correctly
- [ ] Performance targets met (100 payments < 20ms)
- [ ] Edge cases handled (concurrent overpayments, multiple reversals)
- [ ] Browser console verification successful
- [ ] TypeScript compilation passes
- [ ] No stored balance fields anywhere

---

**Status**: ✅ Chunk D3 Complete

**Next Chunk**: D4 - Debt CRUD Operations
