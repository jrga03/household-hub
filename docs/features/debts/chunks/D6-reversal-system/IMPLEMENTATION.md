# D6 Implementation: Reversal System

**Time estimate**: 1.5 hours
**Prerequisites**: D5 (Payment Processing) complete

---

## Step 1: Create Reversal Types (5 min)

Add reversal-specific types to the debt type definitions.

**File**: `src/types/debt.ts`

```typescript
// Add to existing debt.ts file

/**
 * Input for creating a reversal
 */
export interface CreateReversalData {
  payment_id: string;
  reason?: string; // Optional: "transaction_edited" | "transaction_deleted" | "user_initiated"
}

/**
 * Result of reversal operation
 */
export interface ReversalResult {
  reversal: DebtPayment;
  originalPayment: DebtPayment;
  newBalance: number;
  statusChanged: boolean;
  newStatus?: DebtStatus;
}

/**
 * Input for handling transaction edit
 */
export interface TransactionEditData {
  transaction_id: string;
  new_amount_cents?: number;
  new_debt_id?: string;
  new_internal_debt_id?: string;
  payment_date: string; // ISO date for new payment
}

/**
 * Input for handling transaction delete
 */
export interface TransactionDeleteData {
  transaction_id: string;
}
```

**Verification**:

```bash
npm run type-check
# Should pass with no errors
```

---

## Step 2: Create Reversal Utilities (15 min)

Core reversal creation logic.

**File**: `src/lib/debts/reversals.ts` (NEW)

```typescript
import { nanoid } from "nanoid";
import { db } from "@/lib/dexie";
import { getDeviceId } from "@/lib/device";
import { getNextLamportClock } from "@/lib/dexie/lamport-clock";
import { calculateDebtBalance } from "./balance";
import { updateDebtStatusFromBalance } from "./status";
import type { DebtPayment, CreateReversalData, ReversalResult } from "@/types/debt";

/**
 * Create a reversal for a debt payment (compensating event)
 *
 * This creates a negative payment record that offsets the original payment,
 * restoring the debt balance as if the payment never happened.
 *
 * IMPORTANT: This does NOT delete the original payment. Both records persist
 * in the audit trail. Balance calculation excludes both the original and reversal.
 *
 * @param data - Reversal creation data
 * @returns Reversal result with new balance and status
 *
 * @example
 * const result = await reverseDebtPayment({ payment_id: 'pay-123' });
 * console.log(`Reversed ₱${result.reversal.amount_cents / 100}`);
 * console.log(`New balance: ₱${result.newBalance / 100}`);
 */
export async function reverseDebtPayment(data: CreateReversalData): Promise<ReversalResult> {
  // 1. Find original payment
  const originalPayment = await db.debtPayments.get(data.payment_id);

  if (!originalPayment) {
    throw new Error(`Payment ${data.payment_id} not found`);
  }

  // 2. Check if already reversed (idempotent)
  const existingReversal = await db.debtPayments
    .where("reverses_payment_id")
    .equals(data.payment_id)
    .first();

  if (existingReversal) {
    // Already reversed - return existing reversal (idempotent)
    const debtType: "external" | "internal" = originalPayment.debt_id ? "external" : "internal";
    const debtId = originalPayment.debt_id || originalPayment.internal_debt_id!;
    const newBalance = await calculateDebtBalance(debtId, debtType);

    return {
      reversal: existingReversal,
      originalPayment,
      newBalance,
      statusChanged: false,
      newStatus: undefined,
    };
  }

  // 3. Determine debt type and ID
  const debtType: "external" | "internal" = originalPayment.debt_id ? "external" : "internal";
  const debtId = originalPayment.debt_id || originalPayment.internal_debt_id!;

  // 4. Check if original was archived (soft restriction)
  const debt =
    debtType === "external" ? await db.debts.get(debtId) : await db.internalDebts.get(debtId);

  if (debt?.status === "archived") {
    // Soft warning - still allow reversal
    console.warn(`Reversing payment on archived debt ${debtId}. Status will change to active.`);
  }

  // 5. Calculate reversal amount (handle cascading reversals)
  const isReversingReversal = originalPayment.is_reversal === true;
  const reversalAmount = isReversingReversal
    ? Math.abs(originalPayment.amount_cents) // Positive (double negative)
    : -originalPayment.amount_cents; // Negative

  // 6. Generate idempotency key for reversal
  const reversalId = nanoid();
  const lamportClock = await getNextLamportClock();
  const deviceId = await getDeviceId();
  const idempotencyKey = `${deviceId}-debt_payment-${reversalId}-${lamportClock}`;

  // 7. Create reversal record
  const reversal: DebtPayment = {
    id: reversalId,
    debt_id: originalPayment.debt_id,
    internal_debt_id: originalPayment.internal_debt_id,
    transaction_id: originalPayment.transaction_id, // Link to same transaction
    amount_cents: reversalAmount,
    payment_date: new Date().toISOString().split("T")[0], // Today's date
    is_reversal: true,
    reverses_payment_id: data.payment_id,
    is_overpayment: false, // Reversals never overpayments
    overpayment_amount: undefined,
    device_id: deviceId,
    idempotency_key: idempotencyKey,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 8. Insert reversal
  await db.debtPayments.add(reversal);

  // 9. Recalculate balance and update status
  const newBalance = await calculateDebtBalance(debtId, debtType);
  const statusResult = await updateDebtStatusFromBalance(debtId, debtType);

  return {
    reversal,
    originalPayment,
    newBalance,
    statusChanged: statusResult.changed,
    newStatus: statusResult.newStatus,
  };
}

/**
 * Check if a payment has been reversed
 *
 * @param paymentId - Payment ID to check
 * @returns True if payment has a reversal record
 */
export async function isPaymentReversed(paymentId: string): Promise<boolean> {
  const reversal = await db.debtPayments.where("reverses_payment_id").equals(paymentId).first();

  return reversal !== undefined;
}

/**
 * Get all reversals for a payment (including cascading reversals)
 *
 * @param paymentId - Payment ID
 * @returns Array of reversal records
 */
export async function getPaymentReversals(paymentId: string): Promise<DebtPayment[]> {
  return db.debtPayments.where("reverses_payment_id").equals(paymentId).toArray();
}
```

**Verification**:

```bash
npm run type-check
# Should pass with reversal functions typed correctly
```

---

## Step 3: Transaction Edit Handler (20 min)

Handle transaction edits by reversing old payment and creating new one.

**File**: `src/lib/debts/reversals.ts` (APPEND)

```typescript
import { processDebtPayment } from "./payments";
import type { TransactionEditData } from "@/types/debt";

/**
 * Handle transaction edit with debt link
 *
 * This implements the "edit as reverse-and-create" pattern:
 * 1. Find existing payment for this transaction
 * 2. Reverse the old payment (if exists)
 * 3. Create new payment with updated amount/debt
 *
 * This preserves complete audit trail:
 * - Original payment: +₱500
 * - Reversal: -₱500 (transaction edited)
 * - New payment: +₱300 (new amount)
 * - Net effect: ₱300 paid
 *
 * @param data - Transaction edit data
 * @returns Array of operations performed
 *
 * @example
 * // User edits transaction amount from ₱500 to ₱300
 * await handleTransactionEdit({
 *   transaction_id: 'txn-123',
 *   new_amount_cents: 30000,
 *   payment_date: '2025-11-10',
 * });
 */
export async function handleTransactionEdit(data: TransactionEditData) {
  const operations: Array<{
    type: "reversal" | "payment";
    record: DebtPayment;
    debtId: string;
    debtType: "external" | "internal";
  }> = [];

  // 1. Find existing payment for this transaction
  const existingPayment = await db.debtPayments
    .where("transaction_id")
    .equals(data.transaction_id)
    .filter((p) => !p.is_reversal) // Ignore reversals
    .first();

  // 2. Reverse existing payment if found
  if (existingPayment) {
    const reversalResult = await reverseDebtPayment({
      payment_id: existingPayment.id,
      reason: "transaction_edited",
    });

    const oldDebtType: "external" | "internal" = existingPayment.debt_id ? "external" : "internal";
    const oldDebtId = existingPayment.debt_id || existingPayment.internal_debt_id!;

    operations.push({
      type: "reversal",
      record: reversalResult.reversal,
      debtId: oldDebtId,
      debtType: oldDebtType,
    });
  }

  // 3. Create new payment if debt link still exists
  const newDebtId = data.new_debt_id || data.new_internal_debt_id;
  const newAmount = data.new_amount_cents;

  if (newDebtId && newAmount && newAmount > 0) {
    const newDebtType: "external" | "internal" = data.new_debt_id ? "external" : "internal";

    // Get household_id from debt
    const debt =
      newDebtType === "external"
        ? await db.debts.get(newDebtId)
        : await db.internalDebts.get(newDebtId);

    if (!debt) {
      throw new Error(`Debt ${newDebtId} not found`);
    }

    const paymentResult = await processDebtPayment({
      transaction_id: data.transaction_id,
      amount_cents: newAmount,
      payment_date: data.payment_date,
      debt_id: newDebtType === "external" ? newDebtId : undefined,
      internal_debt_id: newDebtType === "internal" ? newDebtId : undefined,
      household_id: debt.household_id,
    });

    operations.push({
      type: "payment",
      record: paymentResult.payment,
      debtId: newDebtId,
      debtType: newDebtType,
    });
  }

  return {
    operations,
    reversalCreated: operations.some((op) => op.type === "reversal"),
    paymentCreated: operations.some((op) => op.type === "payment"),
  };
}
```

**Verification**:

```typescript
// Test transaction edit
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

// Edit transaction amount
const result = await handleTransactionEdit({
  transaction_id: "txn-1",
  new_amount_cents: 30000,
  payment_date: "2025-11-10",
});

console.assert(result.reversalCreated === true, "Reversal created");
console.assert(result.paymentCreated === true, "New payment created");
console.assert(result.operations.length === 2, "Two operations");
```

---

## Step 4: Transaction Delete Handler (15 min)

Handle transaction deletion by reversing its payment.

**File**: `src/lib/debts/reversals.ts` (APPEND)

```typescript
import type { TransactionDeleteData } from "@/types/debt";

/**
 * Handle transaction deletion with debt link
 *
 * This creates a reversal to restore the debt balance as if the
 * transaction never happened.
 *
 * The reversal preserves audit trail:
 * - Original payment: +₱500
 * - Reversal: -₱500 (transaction deleted)
 * - Net effect: ₱0 paid
 *
 * @param data - Transaction delete data
 * @returns Reversal result or undefined if no payment found
 *
 * @example
 * // User deletes transaction with debt link
 * const result = await handleTransactionDelete({
 *   transaction_id: 'txn-123',
 * });
 *
 * if (result) {
 *   console.log(`Reversed payment of ₱${result.originalPayment.amount_cents / 100}`);
 * }
 */
export async function handleTransactionDelete(
  data: TransactionDeleteData
): Promise<ReversalResult | undefined> {
  // 1. Find payment for this transaction
  const payment = await db.debtPayments
    .where("transaction_id")
    .equals(data.transaction_id)
    .filter((p) => !p.is_reversal) // Ignore reversals
    .first();

  if (!payment) {
    // No payment to reverse
    return undefined;
  }

  // 2. Reverse the payment
  const reversalResult = await reverseDebtPayment({
    payment_id: payment.id,
    reason: "transaction_deleted",
  });

  return reversalResult;
}
```

**Verification**:

```typescript
// Test transaction delete
const debt = await createExternalDebt({
  name: "Test Debt",
  original_amount_cents: 100000,
  household_id: "h1",
});

const payment = await processDebtPayment({
  transaction_id: "txn-2",
  amount_cents: 50000,
  payment_date: "2025-11-10",
  debt_id: debt.id,
  household_id: "h1",
});

// Delete transaction
const result = await handleTransactionDelete({
  transaction_id: "txn-2",
});

console.assert(result !== undefined, "Reversal created");
console.assert(result.reversal.amount_cents === -50000, "Reversal amount correct");
console.assert(result.newBalance === 100000, "Balance restored");
```

---

## Step 5: Create Unit Tests (30 min)

Comprehensive tests for reversal scenarios.

**File**: `src/lib/debts/__tests__/reversals.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie";
import { createExternalDebt } from "../crud";
import { processDebtPayment } from "../payments";
import { calculateDebtBalance } from "../balance";
import {
  reverseDebtPayment,
  isPaymentReversed,
  getPaymentReversals,
  handleTransactionEdit,
  handleTransactionDelete,
} from "../reversals";

describe("Reversal System", () => {
  beforeEach(async () => {
    // Clear tables before each test
    await db.debts.clear();
    await db.debtPayments.clear();
  });

  describe("reverseDebtPayment", () => {
    it("should create reversal for normal payment", async () => {
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

      const result = await reverseDebtPayment({ payment_id: payment.payment.id });

      expect(result.reversal.amount_cents).toBe(-50000);
      expect(result.reversal.is_reversal).toBe(true);
      expect(result.reversal.reverses_payment_id).toBe(payment.payment.id);
      expect(result.newBalance).toBe(100000); // Balance restored
    });

    it("should handle cascading reversal (reversing a reversal)", async () => {
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

      // First reversal
      const reversal1 = await reverseDebtPayment({ payment_id: payment.payment.id });
      expect(reversal1.reversal.amount_cents).toBe(-50000);

      // Reverse the reversal (double negative)
      const reversal2 = await reverseDebtPayment({
        payment_id: reversal1.reversal.id,
      });

      expect(reversal2.reversal.amount_cents).toBe(50000); // Positive!
      expect(reversal2.newBalance).toBe(50000); // Back to original
    });

    it("should be idempotent (reversing twice returns same reversal)", async () => {
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

      const result1 = await reverseDebtPayment({ payment_id: payment.payment.id });
      const result2 = await reverseDebtPayment({ payment_id: payment.payment.id });

      expect(result1.reversal.id).toBe(result2.reversal.id);
      expect(result2.statusChanged).toBe(false);
    });

    it("should throw error if payment not found", async () => {
      await expect(reverseDebtPayment({ payment_id: "nonexistent" })).rejects.toThrow(
        "Payment nonexistent not found"
      );
    });

    it("should update debt status after reversal", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      // Pay off debt completely
      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const debtAfterPayment = await db.debts.get(debt.id);
      expect(debtAfterPayment?.status).toBe("paid_off");

      // Reverse payment
      const result = await reverseDebtPayment({ payment_id: payment.payment.id });

      expect(result.statusChanged).toBe(true);
      expect(result.newStatus).toBe("active");

      const debtAfterReversal = await db.debts.get(debt.id);
      expect(debtAfterReversal?.status).toBe("active");
    });
  });

  describe("isPaymentReversed", () => {
    it("should return true for reversed payment", async () => {
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

      await reverseDebtPayment({ payment_id: payment.payment.id });

      const isReversed = await isPaymentReversed(payment.payment.id);
      expect(isReversed).toBe(true);
    });

    it("should return false for non-reversed payment", async () => {
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

      const isReversed = await isPaymentReversed(payment.payment.id);
      expect(isReversed).toBe(false);
    });
  });

  describe("getPaymentReversals", () => {
    it("should return all reversals for payment", async () => {
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

      const reversal1 = await reverseDebtPayment({ payment_id: payment.payment.id });

      const reversals = await getPaymentReversals(payment.payment.id);
      expect(reversals.length).toBe(1);
      expect(reversals[0].id).toBe(reversal1.reversal.id);
    });
  });

  describe("handleTransactionEdit", () => {
    it("should reverse old payment and create new payment", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
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

      const result = await handleTransactionEdit({
        transaction_id: "txn-1",
        new_amount_cents: 30000,
        new_debt_id: debt.id,
        payment_date: "2025-11-10",
      });

      expect(result.reversalCreated).toBe(true);
      expect(result.paymentCreated).toBe(true);
      expect(result.operations.length).toBe(2);

      const balance = await calculateDebtBalance(debt.id, "external");
      expect(balance).toBe(70000); // 100000 - 30000
    });

    it("should handle debt link removal (only reversal)", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
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

      const result = await handleTransactionEdit({
        transaction_id: "txn-1",
        new_amount_cents: 0, // Remove debt link
        payment_date: "2025-11-10",
      });

      expect(result.reversalCreated).toBe(true);
      expect(result.paymentCreated).toBe(false);

      const balance = await calculateDebtBalance(debt.id, "external");
      expect(balance).toBe(100000); // Balance restored
    });

    it("should handle debt link change (reverse on old, create on new)", async () => {
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

      const result = await handleTransactionEdit({
        transaction_id: "txn-1",
        new_amount_cents: 50000,
        new_debt_id: debt2.id, // Change to debt2
        payment_date: "2025-11-10",
      });

      expect(result.operations.length).toBe(2);

      const balance1 = await calculateDebtBalance(debt1.id, "external");
      const balance2 = await calculateDebtBalance(debt2.id, "external");

      expect(balance1).toBe(100000); // Debt 1 restored
      expect(balance2).toBe(150000); // Debt 2 reduced
    });
  });

  describe("handleTransactionDelete", () => {
    it("should reverse payment when transaction deleted", async () => {
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

      const result = await handleTransactionDelete({
        transaction_id: "txn-1",
      });

      expect(result).toBeDefined();
      expect(result?.reversal.amount_cents).toBe(-50000);
      expect(result?.newBalance).toBe(100000);
    });

    it("should return undefined if no payment found", async () => {
      const result = await handleTransactionDelete({
        transaction_id: "nonexistent",
      });

      expect(result).toBeUndefined();
    });

    it("should update status after reversal", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const debtBefore = await db.debts.get(debt.id);
      expect(debtBefore?.status).toBe("paid_off");

      const result = await handleTransactionDelete({
        transaction_id: "txn-1",
      });

      expect(result?.statusChanged).toBe(true);
      expect(result?.newStatus).toBe("active");
    });
  });
});
```

**Run tests**:

```bash
npm test src/lib/debts/__tests__/reversals.test.ts
# Expected: 15+ tests pass
```

---

## Step 6: Export Public API (5 min)

Export reversal functions from main debts module.

**File**: `src/lib/debts/index.ts` (MODIFY)

```typescript
// ... existing exports ...

export {
  reverseDebtPayment,
  isPaymentReversed,
  getPaymentReversals,
  handleTransactionEdit,
  handleTransactionDelete,
} from "./reversals";
```

**Verification**:

```typescript
// Test imports
import { reverseDebtPayment, handleTransactionEdit, handleTransactionDelete } from "@/lib/debts";

console.log("Imports successful");
```

---

## Step 7: Update Balance Calculation (Verify Only) (5 min)

**VERIFICATION ONLY** - The balance calculation from D3 already excludes reversals correctly. Verify it's working.

**File**: `src/lib/debts/balance.ts` (READ ONLY - should already be correct)

Verify this logic exists:

```typescript
// O(1) reversal filtering using Set
const reversedIds = new Set(
  payments.filter((p) => p.reverses_payment_id).map((p) => p.reverses_payment_id!)
);

// Exclude both reversals AND reversed payments
const validPayments = payments.filter((p) => !p.is_reversal && !reversedIds.has(p.id));
```

**Test it**:

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

const balanceAfterPayment = await calculateDebtBalance(debt.id, "external");
console.assert(balanceAfterPayment === 50000, "Balance after payment");

await reverseDebtPayment({ payment_id: payment.payment.id });

const balanceAfterReversal = await calculateDebtBalance(debt.id, "external");
console.assert(balanceAfterReversal === 100000, "Balance after reversal");
```

If this fails, the balance calculation from D3 needs fixing.

---

## Step 8: Integration Documentation (10 min)

Document how to integrate reversals with transaction form.

**File**: `src/lib/debts/reversals.ts` (ADD JSDOC)

Add this documentation comment at the top of the file:

````typescript
/**
 * Reversal System - Compensating Events for Debt Payments
 *
 * This module implements the compensating events pattern for handling
 * transaction edits and deletes without losing audit trail.
 *
 * ## Core Concept
 *
 * When a transaction with a debt link is edited or deleted, we DON'T
 * update or delete the payment record. Instead, we create a REVERSAL:
 * a negative payment that offsets the original payment.
 *
 * ## Why Reversals?
 *
 * 1. **Audit Trail**: Complete history preserved (who paid what, when)
 * 2. **Event Sourcing**: Reversals are natural compensating events
 * 3. **Conflict Resolution**: Reversals compose cleanly in multi-device scenarios
 * 4. **Error Recovery**: Mistakes can be reversed without data loss
 *
 * ## Integration with Transaction Form
 *
 * ```typescript
 * import { handleTransactionEdit, handleTransactionDelete } from '@/lib/debts';
 *
 * // When user edits transaction
 * async function updateTransaction(id, updates) {
 *   // 1. Update transaction in database
 *   await db.transactions.update(id, updates);
 *
 *   // 2. Handle debt payment reversals/recreation
 *   if (updates.amount_cents || updates.debt_id) {
 *     await handleTransactionEdit({
 *       transaction_id: id,
 *       new_amount_cents: updates.amount_cents,
 *       new_debt_id: updates.debt_id,
 *       payment_date: updates.date,
 *     });
 *   }
 * }
 *
 * // When user deletes transaction
 * async function deleteTransaction(id) {
 *   // 1. Handle debt payment reversal FIRST
 *   await handleTransactionDelete({ transaction_id: id });
 *
 *   // 2. Delete transaction
 *   await db.transactions.delete(id);
 * }
 * ```
 *
 * ## Cascading Reversals
 *
 * Reversing a reversal creates a positive payment (double negative).
 * This allows undoing accidental reversals.
 *
 * Example:
 * - Original payment: +₱500
 * - First reversal: -₱500 (balance restored to ₱1,000)
 * - Second reversal: +₱500 (balance back to ₱500)
 *
 * @module reversals
 */
````

---

## Final Verification

Run all tests and verify integration:

```bash
# Run all debt tests
npm test src/lib/debts
# Expected: 60+ tests pass (40 from D1-D5, 15+ from D6)

# Type check
npm run type-check
# Should pass with no errors

# Lint
npm run lint
# Should pass with no warnings
```

**Manual testing**:

```typescript
// Test complete reversal flow
import {
  createExternalDebt,
  processDebtPayment,
  reverseDebtPayment,
  handleTransactionEdit,
  handleTransactionDelete,
  calculateDebtBalance,
} from "@/lib/debts";

// 1. Create debt
const debt = await createExternalDebt({
  name: "Car Loan",
  original_amount_cents: 500000,
  household_id: "h1",
});

console.log("Initial balance:", await calculateDebtBalance(debt.id, "external")); // 500000

// 2. Make payment
const payment1 = await processDebtPayment({
  transaction_id: "txn-1",
  amount_cents: 100000,
  payment_date: "2025-11-01",
  debt_id: debt.id,
  household_id: "h1",
});

console.log("After payment:", await calculateDebtBalance(debt.id, "external")); // 400000

// 3. Edit transaction (change amount)
await handleTransactionEdit({
  transaction_id: "txn-1",
  new_amount_cents: 150000, // Increased payment
  new_debt_id: debt.id,
  payment_date: "2025-11-01",
});

console.log("After edit:", await calculateDebtBalance(debt.id, "external")); // 350000

// 4. Delete transaction
await handleTransactionDelete({
  transaction_id: "txn-1",
});

console.log("After delete:", await calculateDebtBalance(debt.id, "external")); // 500000 (restored)
```

---

## Troubleshooting

### Issue: Balance not restored after reversal

**Symptom**: `calculateDebtBalance` returns wrong value after reversal.

**Cause**: Balance calculation (D3) not excluding reversed payments.

**Fix**: Check balance.ts has proper reversal exclusion:

```typescript
const reversedIds = new Set(
  payments.filter((p) => p.reverses_payment_id).map((p) => p.reverses_payment_id!)
);
const validPayments = payments.filter((p) => !p.is_reversal && !reversedIds.has(p.id));
```

---

### Issue: Cascading reversal creates wrong amount

**Symptom**: Reversing a reversal creates negative amount instead of positive.

**Cause**: Not checking `is_reversal` flag before calculating amount.

**Fix**: Verify reverseDebtPayment has:

```typescript
const isReversingReversal = originalPayment.is_reversal === true;
const reversalAmount = isReversingReversal
  ? Math.abs(originalPayment.amount_cents)
  : -originalPayment.amount_cents;
```

---

### Issue: Duplicate reversals created

**Symptom**: Multiple reversal records for same payment.

**Cause**: Missing idempotency check.

**Fix**: Verify reverseDebtPayment has:

```typescript
const existingReversal = await db.debtPayments
  .where("reverses_payment_id")
  .equals(data.payment_id)
  .first();

if (existingReversal) {
  return { reversal: existingReversal /* ... */ };
}
```

---

### Issue: Status not updating after reversal

**Symptom**: Debt status stays `paid_off` after reversal.

**Cause**: Not calling `updateDebtStatusFromBalance` after reversal.

**Fix**: Verify reverseDebtPayment ends with:

```typescript
const statusResult = await updateDebtStatusFromBalance(debtId, debtType);
```

---

## ★ Insight ─────────────────────────────────────

**Compensating Events Pattern**: Reversals implement the compensating events pattern from event sourcing. Instead of UPDATE/DELETE operations (which lose history), we create new events that semantically reverse previous events. This pattern is critical for:

1. **Audit Trails**: Every change is visible in the event log
2. **Conflict Resolution**: Reversals compose cleanly across devices (two devices can both reverse the same payment, and the second one becomes idempotent)
3. **Error Recovery**: Mistakes can be undone by reversing the reversal

**Double Negative Handling**: When reversing a reversal, we create a positive payment. This might seem counterintuitive, but it's mathematically correct:

- Original: +₱500 (debt decreased)
- Reversal: -₱500 (debt restored)
- Reverse reversal: +₱500 (debt decreased again)

The balance calculation excludes both the original and first reversal, so only the second reversal affects balance.

**Idempotency by Default**: All reversal operations are idempotent. Reversing a payment twice returns the existing reversal. This prevents duplicate reversals in offline scenarios where sync might replay events.

─────────────────────────────────────────────────

---

**Time check**: You should have completed D6 in ~1.5 hours.

**Next**: Chunk D7 - Debt UI Components
