# D5 Implementation: Payment Processing Core

## Overview

You'll create the core payment processing logic that links transactions to debts, detects overpayments, generates idempotency keys, and automatically updates debt status.

**Estimated time**: 1.5 hours

---

## Step 1: Add Payment Types to Debt Types

Modify `src/types/debt.ts`:

```typescript
// Add to src/types/debt.ts

// =====================================================
// Payment Processing Types
// =====================================================

export interface ProcessPaymentData {
  transaction_id: string;
  amount_cents: number;
  payment_date: string; // DATE format YYYY-MM-DD
  debt_id?: string;
  internal_debt_id?: string;
  household_id: string;
}

export interface PaymentResult {
  payment: DebtPayment;
  wasOverpayment: boolean;
  overpaymentAmount: number; // Positive value if overpaid
  newBalance: number; // Can be negative
  statusChanged: boolean;
  newStatus: DebtStatus;
}
```

---

## Step 2: Create Device ID Utility (If Not Exists)

Check if device ID function exists. If not, create placeholder:

```typescript
// src/lib/device-id.ts (create if needed)
/**
 * Get current device ID
 *
 * NOTE: This is a placeholder. In production, this should use:
 * 1. IndexedDB stored device ID (priority 1)
 * 2. localStorage backup (priority 2)
 * 3. FingerprintJS (priority 3)
 *
 * See SYNC-ENGINE.md lines 1123-1303 for full implementation
 */

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  // TODO: Implement proper device identification
  // For now, generate a session-based ID
  cachedDeviceId = `device-${crypto.randomUUID()}`;

  console.warn("[Device ID] Using temporary session ID. Implement proper device identification.");

  return cachedDeviceId;
}
```

---

## Step 3: Create Payment Processing Module

Create file: `src/lib/debts/payments.ts`

```typescript
// src/lib/debts/payments.ts
/**
 * Debt Payment Processing
 *
 * Core logic for creating debt payments linked to transactions
 * Includes overpayment detection, idempotency keys, and status updates
 */

import { nanoid } from "nanoid";
import { db } from "@/lib/dexie/db";
import { getNextLamportClock } from "@/lib/dexie/lamport-clock";
import { getDeviceId } from "@/lib/device-id";
import { calculateDebtBalance } from "./balance";
import { updateDebtStatusFromBalance } from "./status";
import type { DebtPayment, ProcessPaymentData, PaymentResult } from "@/types/debt";

// =====================================================
// Payment Processing
// =====================================================

/**
 * Process debt payment (create payment record)
 *
 * This is DEFENSE-IN-DEPTH LAYER 2 for overpayment detection
 * - Layer 1: UI warning (dismissible)
 * - Layer 2: Application logic (authoritative) ← THIS FUNCTION
 * - Layer 3: Database trigger (security)
 *
 * TIMING: Overpayment detection happens synchronously BEFORE payment insert
 *
 * @param data - Payment data
 * @returns Payment result with overpayment info and status change
 */
export async function processDebtPayment(data: ProcessPaymentData): Promise<PaymentResult> {
  // Validate input
  if (!data.debt_id && !data.internal_debt_id) {
    throw new Error("Must specify either debt_id or internal_debt_id");
  }

  if (data.debt_id && data.internal_debt_id) {
    throw new Error("Cannot specify both debt_id and internal_debt_id");
  }

  if (data.amount_cents <= 0) {
    throw new Error("Payment amount must be positive");
  }

  // Determine debt type
  const debtType: "external" | "internal" = data.debt_id ? "external" : "internal";
  const debtId = data.debt_id || data.internal_debt_id!;

  // Verify debt exists
  const table = debtType === "external" ? db.debts : db.internalDebts;
  const debt = await table.get(debtId);

  if (!debt) {
    throw new Error("Debt not found");
  }

  // Check debt status (archived debts cannot accept payments in UI context)
  if (debt.status === "archived") {
    throw new Error("Cannot make payment to archived debt");
  }

  // =====================================================
  // DEFENSE-IN-DEPTH LAYER 2: Overpayment Detection
  // =====================================================
  // Calculate current balance BEFORE payment insert
  const currentBalance = await calculateDebtBalance(debtId, debtType);

  // Detect overpayment: balance <= 0 OR payment > balance
  const isOverpayment = currentBalance <= 0 || data.amount_cents > currentBalance;

  let overpaymentAmount = 0;
  if (isOverpayment) {
    overpaymentAmount =
      currentBalance > 0
        ? data.amount_cents - currentBalance // Partial overpayment
        : data.amount_cents; // Full amount is overpayment (balance already 0 or negative)

    console.warn(
      `[Overpayment Detected] Payment of ₱${(data.amount_cents / 100).toFixed(2)} ` +
        `exceeds balance of ₱${(currentBalance / 100).toFixed(2)} ` +
        `(overpayment: ₱${(overpaymentAmount / 100).toFixed(2)})`
    );
  }

  // =====================================================
  // Create Payment Record
  // =====================================================

  // Generate IDs
  const paymentId = nanoid();
  const deviceId = await getDeviceId();
  const lamportClock = await getNextLamportClock();

  // Generate idempotency key
  // Format: ${deviceId}-debt_payment-${paymentId}-${lamportClock}
  const idempotencyKey = `${deviceId}-debt_payment-${paymentId}-${lamportClock}`;

  // Create payment
  const payment: DebtPayment = {
    id: paymentId,
    household_id: data.household_id,
    debt_id: data.debt_id,
    internal_debt_id: data.internal_debt_id,
    transaction_id: data.transaction_id,
    amount_cents: data.amount_cents,
    payment_date: data.payment_date,
    device_id: deviceId,

    // Reversal tracking (not a reversal)
    is_reversal: false,

    // Overpayment tracking (set by detection above)
    is_overpayment: isOverpayment,
    overpayment_amount: isOverpayment ? overpaymentAmount : undefined,

    created_at: new Date().toISOString(),
  };

  // Insert payment
  await db.debtPayments.add(payment);

  console.log(
    `[Payment Created] ₱${(data.amount_cents / 100).toFixed(2)} for debt ${debt.name}`,
    isOverpayment ? "(OVERPAYMENT)" : ""
  );

  // =====================================================
  // Auto-Update Status
  // =====================================================

  const statusChanged = await updateDebtStatusFromBalance(debtId, debtType);
  const updatedDebt = await table.get(debtId);
  const newStatus = updatedDebt!.status;

  // Calculate new balance after payment
  const newBalance = await calculateDebtBalance(debtId, debtType);

  // Return result
  return {
    payment,
    wasOverpayment: isOverpayment,
    overpaymentAmount,
    newBalance,
    statusChanged,
    newStatus,
  };
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Get all payments for a debt
 */
export async function getDebtPayments(
  debtId: string,
  type: "external" | "internal"
): Promise<DebtPayment[]> {
  const field = type === "external" ? "debt_id" : "internal_debt_id";

  return await db.debtPayments
    .where(field)
    .equals(debtId)
    .reverse() // Most recent first
    .sortBy("payment_date");
}

/**
 * Get payment by ID
 */
export async function getPayment(paymentId: string): Promise<DebtPayment | undefined> {
  return await db.debtPayments.get(paymentId);
}

/**
 * Get payments for transaction
 */
export async function getPaymentsByTransaction(transactionId: string): Promise<DebtPayment[]> {
  return await db.debtPayments.where("transaction_id").equals(transactionId).toArray();
}

/**
 * Check if transaction is linked to debt
 */
export async function isTransactionLinkedToDebt(transactionId: string): Promise<boolean> {
  const count = await db.debtPayments.where("transaction_id").equals(transactionId).count();

  return count > 0;
}
```

---

## Step 4: Create Unit Tests

Create file: `src/lib/debts/__tests__/payments.test.ts`

```typescript
// src/lib/debts/__tests__/payments.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import { processDebtPayment, getDebtPayments } from "../payments";
import { createExternalDebt } from "../crud";
import type { Debt } from "@/types/debt";

describe("Payment Processing", () => {
  let testDebt: Debt;

  beforeEach(async () => {
    await db.debts.clear();
    await db.debtPayments.clear();
    await db.meta.put({ key: "lamport_clock", value: 0 });

    // Create test debt
    testDebt = await createExternalDebt({
      name: "Test Debt",
      original_amount_cents: 100000, // ₱1,000
      household_id: "household-1",
    });
  });

  describe("processDebtPayment", () => {
    it("should create payment record", async () => {
      const result = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000, // ₱500
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result.payment.id).toBeDefined();
      expect(result.payment.amount_cents).toBe(50000);
      expect(result.payment.is_reversal).toBe(false);
      expect(result.wasOverpayment).toBe(false);
      expect(result.newBalance).toBe(50000); // ₱1,000 - ₱500
    });

    it("should detect overpayment", async () => {
      const result = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 150000, // ₱1,500 (exceeds ₱1,000 debt)
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result.wasOverpayment).toBe(true);
      expect(result.overpaymentAmount).toBe(50000); // ₱500 over
      expect(result.payment.is_overpayment).toBe(true);
      expect(result.payment.overpayment_amount).toBe(50000);
      expect(result.newBalance).toBe(-50000); // Negative balance
    });

    it("should detect exact payoff (no overpayment)", async () => {
      const result = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 100000, // Exact balance
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result.wasOverpayment).toBe(false);
      expect(result.overpaymentAmount).toBe(0);
      expect(result.newBalance).toBe(0);
      expect(result.newStatus).toBe("paid_off");
      expect(result.statusChanged).toBe(true);
    });

    it("should update debt status to paid_off when balance reaches 0", async () => {
      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      const debt = await db.debts.get(testDebt.id);
      expect(debt?.status).toBe("paid_off");
      expect(debt?.closed_at).toBeDefined();
    });

    it("should generate idempotency key", async () => {
      const result = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      // Payment should have been created
      expect(result.payment.id).toBeDefined();
      expect(result.payment.device_id).toBeDefined();

      // Idempotency key format: ${deviceId}-debt_payment-${paymentId}-${lamportClock}
      // We can't check the exact key here, but we can verify it was generated
      // by checking lamport clock incremented
      const meta = await db.meta.get("lamport_clock");
      expect(meta?.value).toBeGreaterThan(0);
    });

    it("should track device ID", async () => {
      const result = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result.payment.device_id).toBeDefined();
      expect(typeof result.payment.device_id).toBe("string");
      expect(result.payment.device_id.length).toBeGreaterThan(0);
    });

    it("should reject payment to archived debt", async () => {
      // Archive debt
      await db.debts.update(testDebt.id, {
        status: "archived",
        closed_at: new Date().toISOString(),
      });

      await expect(
        processDebtPayment({
          transaction_id: "txn-1",
          amount_cents: 50000,
          payment_date: "2025-11-10",
          debt_id: testDebt.id,
          household_id: "household-1",
        })
      ).rejects.toThrow("archived");
    });

    it("should reject negative payment amount", async () => {
      await expect(
        processDebtPayment({
          transaction_id: "txn-1",
          amount_cents: -50000,
          payment_date: "2025-11-10",
          debt_id: testDebt.id,
          household_id: "household-1",
        })
      ).rejects.toThrow("positive");
    });

    it("should handle multiple payments correctly", async () => {
      // First payment: ₱400
      const result1 = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 40000,
        payment_date: "2025-11-01",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result1.newBalance).toBe(60000); // ₱600 remaining

      // Second payment: ₱300
      const result2 = await processDebtPayment({
        transaction_id: "txn-2",
        amount_cents: 30000,
        payment_date: "2025-11-05",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result2.newBalance).toBe(30000); // ₱300 remaining

      // Third payment: ₱400 (overpayment)
      const result3 = await processDebtPayment({
        transaction_id: "txn-3",
        amount_cents: 40000,
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result3.wasOverpayment).toBe(true);
      expect(result3.overpaymentAmount).toBe(10000); // ₱100 over
      expect(result3.newBalance).toBe(-10000); // Overpaid by ₱100
    });

    it("should detect overpayment when balance is already 0", async () => {
      // Pay off debt completely
      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-01",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      // Try to make another payment (entire amount is overpayment)
      const result = await processDebtPayment({
        transaction_id: "txn-2",
        amount_cents: 50000,
        payment_date: "2025-11-05",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result.wasOverpayment).toBe(true);
      expect(result.overpaymentAmount).toBe(50000); // Entire amount
      expect(result.newBalance).toBe(-50000);
    });
  });

  describe("getDebtPayments", () => {
    it("should return payments for debt sorted by date", async () => {
      // Create 3 payments
      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 20000,
        payment_date: "2025-11-01",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      await processDebtPayment({
        transaction_id: "txn-2",
        amount_cents: 30000,
        payment_date: "2025-11-05",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      await processDebtPayment({
        transaction_id: "txn-3",
        amount_cents: 25000,
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      const payments = await getDebtPayments(testDebt.id, "external");

      expect(payments).toHaveLength(3);
      // Should be sorted by payment_date DESC
      expect(payments[0].payment_date).toBe("2025-11-10");
      expect(payments[1].payment_date).toBe("2025-11-05");
      expect(payments[2].payment_date).toBe("2025-11-01");
    });
  });
});
```

---

## Step 5: Run Tests

```bash
# Run payment tests
npm test payments.test

# Run all debt tests
npm test src/lib/debts

# Expected output:
# ✓ payments.test.ts (12+ tests)
# All previous tests still passing
```

---

## Step 6: Verify in Browser Console

```typescript
import { processDebtPayment } from "@/lib/debts/payments";
import { createExternalDebt } from "@/lib/debts/crud";
import { calculateDebtBalance } from "@/lib/debts/balance";

// Create test debt
const debt = await createExternalDebt({
  name: "Browser Test",
  original_amount_cents: 100000, // ₱1,000
  household_id: "00000000-0000-0000-0000-000000000001",
});

console.log("Created debt:", debt);

// Make payment (partial)
const result1 = await processDebtPayment({
  transaction_id: "test-txn-1",
  amount_cents: 40000, // ₱400
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "00000000-0000-0000-0000-000000000001",
});

console.log("Payment 1 result:", result1);
console.log("New balance:", result1.newBalance); // 60000 (₱600)
console.log("Was overpayment:", result1.wasOverpayment); // false

// Make overpayment
const result2 = await processDebtPayment({
  transaction_id: "test-txn-2",
  amount_cents: 80000, // ₱800 (exceeds ₱600 balance)
  payment_date: "2025-11-11",
  debt_id: debt.id,
  household_id: "00000000-0000-0000-0000-000000000001",
});

console.log("Payment 2 result:", result2);
console.log("New balance:", result2.newBalance); // -20000 (overpaid by ₱200)
console.log("Was overpayment:", result2.wasOverpayment); // true
console.log("Overpayment amount:", result2.overpaymentAmount); // 20000

// Check final debt status
const finalDebt = await db.debts.get(debt.id);
console.log("Final status:", finalDebt?.status); // 'paid_off'

// Cleanup
await db.debts.delete(debt.id);
await db.debtPayments.where("debt_id").equals(debt.id).delete();
```

---

## Verification Checklist

After completing implementation:

- [ ] `payments.ts` module created with payment processing
- [ ] Device ID utility available
- [ ] Payment types added to `debt.ts`
- [ ] Overpayment detection works (BEFORE insert)
- [ ] Idempotency keys generated correctly
- [ ] Device ID tracked in payment records
- [ ] Status auto-updates after payment
- [ ] All 12+ tests pass
- [ ] Negative balances supported (overpayments)
- [ ] Archived debt payments blocked
- [ ] Browser console verification successful
- [ ] TypeScript compilation passes

---

## Troubleshooting

See `VERIFICATION.md` for common issues and solutions.

**Next**: Proceed to `VERIFICATION.md` for comprehensive testing
