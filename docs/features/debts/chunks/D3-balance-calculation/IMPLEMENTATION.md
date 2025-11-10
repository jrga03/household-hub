# D3 Implementation: Balance Calculation & Status Logic

## Overview

You'll create the core business logic for calculating debt balances from payment history and automatically updating debt status based on current balance. This is pure TypeScript logic with no UI components.

**Estimated time**: 1 hour

---

## Step 1: Create Balance Calculation Module

Create file: `src/lib/debts/balance.ts`

```typescript
// src/lib/debts/balance.ts
/**
 * Balance Calculation Logic
 *
 * Core principle: Balance is DERIVED from payment history, never stored.
 * Formula: current_balance = original_amount - SUM(valid_payments)
 *
 * Valid payments = all payments EXCEPT:
 * 1. Reversal records (is_reversal = true)
 * 2. Payments that have been reversed (exists in reverses_payment_id)
 */

import { db } from "@/lib/dexie/db";
import type { DebtPayment } from "@/types/debt";

// =====================================================
// Types
// =====================================================

export interface DebtBalanceDetails {
  original_amount_cents: number;
  total_paid_cents: number;
  current_balance_cents: number; // Can be negative (overpaid)
  payment_count: number;
  reversal_count: number;
  is_overpaid: boolean;
  overpayment_amount_cents: number; // Positive value if overpaid
}

// =====================================================
// Main Balance Calculation
// =====================================================

/**
 * Calculate current balance for a debt
 *
 * @param debtId - Debt UUID
 * @param type - 'external' or 'internal'
 * @returns Current balance in cents (negative if overpaid)
 *
 * @example
 * const balance = await calculateDebtBalance('debt-123', 'external');
 * // Returns: 50000 (₱500.00 remaining)
 * // Or: -5000 (overpaid by ₱50.00)
 */
export async function calculateDebtBalance(
  debtId: string,
  type: "external" | "internal"
): Promise<number> {
  // 1. Get debt record
  const debt =
    type === "external" ? await db.debts.get(debtId) : await db.internalDebts.get(debtId);

  if (!debt) {
    console.warn(`[Balance] Debt not found: ${debtId} (${type})`);
    return 0; // Defensive: deleted debt has no balance
  }

  // 2. Get all payments for this debt
  const payments = await db.debtPayments
    .where(type === "external" ? "debt_id" : "internal_debt_id")
    .equals(debtId)
    .toArray();

  if (payments.length === 0) {
    // No payments yet - full balance owed
    return debt.original_amount_cents;
  }

  // 3. Filter valid payments (exclude reversals AND reversed payments)
  const totalPaid = sumValidPayments(payments);

  // 4. Calculate balance (can be negative)
  const balance = debt.original_amount_cents - totalPaid;

  return balance;
}

/**
 * Calculate balance with detailed breakdown
 *
 * @param debtId - Debt UUID
 * @param type - 'external' or 'internal'
 * @returns Detailed balance information
 *
 * @example
 * const details = await calculateDebtBalanceWithDetails('debt-123', 'external');
 * console.log(`Paid: ${details.total_paid_cents}, Remaining: ${details.current_balance_cents}`);
 */
export async function calculateDebtBalanceWithDetails(
  debtId: string,
  type: "external" | "internal"
): Promise<DebtBalanceDetails> {
  // Get debt
  const debt =
    type === "external" ? await db.debts.get(debtId) : await db.internalDebts.get(debtId);

  if (!debt) {
    // Return zero state for deleted debt
    return {
      original_amount_cents: 0,
      total_paid_cents: 0,
      current_balance_cents: 0,
      payment_count: 0,
      reversal_count: 0,
      is_overpaid: false,
      overpayment_amount_cents: 0,
    };
  }

  // Get payments
  const payments = await db.debtPayments
    .where(type === "external" ? "debt_id" : "internal_debt_id")
    .equals(debtId)
    .toArray();

  // Calculate totals
  const totalPaid = sumValidPayments(payments);
  const balance = debt.original_amount_cents - totalPaid;

  // Count payments and reversals
  const reversedIds = getReversedPaymentIds(payments);
  const validPayments = payments.filter((p) => !p.is_reversal && !reversedIds.has(p.id));
  const reversals = payments.filter((p) => p.is_reversal);

  // Overpayment detection
  const isOverpaid = balance < 0;
  const overpaymentAmount = isOverpaid ? Math.abs(balance) : 0;

  return {
    original_amount_cents: debt.original_amount_cents,
    total_paid_cents: totalPaid,
    current_balance_cents: balance,
    payment_count: validPayments.length,
    reversal_count: reversals.length,
    is_overpaid: isOverpaid,
    overpayment_amount_cents: overpaymentAmount,
  };
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Sum all valid payments (excludes reversals and reversed payments)
 *
 * Algorithm:
 * 1. Build set of reversed payment IDs for O(1) lookups
 * 2. Filter payments that are:
 *    - NOT reversal records (is_reversal = false)
 *    - NOT reversed by another payment (id not in reversedIds)
 * 3. Sum amount_cents
 *
 * @param payments - All payments for a debt
 * @returns Total paid amount in cents
 */
function sumValidPayments(payments: DebtPayment[]): number {
  // Pre-compute reversed payment IDs (O(n) once)
  const reversedIds = getReversedPaymentIds(payments);

  // Filter valid payments (O(n) with O(1) lookups)
  const validPayments = payments.filter(
    (p) =>
      !p.is_reversal && // Exclude reversal records
      !reversedIds.has(p.id) // Exclude reversed payments
  );

  // Sum amounts
  const total = validPayments.reduce((sum, p) => sum + p.amount_cents, 0);

  return total;
}

/**
 * Get set of payment IDs that have been reversed
 *
 * @param payments - All payments
 * @returns Set of reversed payment IDs
 */
function getReversedPaymentIds(payments: DebtPayment[]): Set<string> {
  const reversedIds = new Set<string>();

  for (const payment of payments) {
    if (payment.reverses_payment_id) {
      reversedIds.add(payment.reverses_payment_id);
    }
  }

  return reversedIds;
}

// =====================================================
// Bulk Operations (for dashboards)
// =====================================================

/**
 * Calculate balances for multiple debts (optimized batch query)
 *
 * @param debtIds - Array of debt UUIDs
 * @param type - 'external' or 'internal'
 * @returns Map of debtId → balance
 */
export async function calculateMultipleBalances(
  debtIds: string[],
  type: "external" | "internal"
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();

  // Batch fetch all debts
  const debts =
    type === "external"
      ? await db.debts.where("id").anyOf(debtIds).toArray()
      : await db.internalDebts.where("id").anyOf(debtIds).toArray();

  // Batch fetch all payments for these debts
  const field = type === "external" ? "debt_id" : "internal_debt_id";
  const allPayments = await db.debtPayments.where(field).anyOf(debtIds).toArray();

  // Group payments by debt
  const paymentsByDebt = new Map<string, DebtPayment[]>();
  for (const payment of allPayments) {
    const debtId = payment.debt_id || payment.internal_debt_id!;
    if (!paymentsByDebt.has(debtId)) {
      paymentsByDebt.set(debtId, []);
    }
    paymentsByDebt.get(debtId)!.push(payment);
  }

  // Calculate balance for each debt
  for (const debt of debts) {
    const payments = paymentsByDebt.get(debt.id) || [];
    const totalPaid = sumValidPayments(payments);
    const balance = debt.original_amount_cents - totalPaid;
    balances.set(debt.id, balance);
  }

  // Fill in missing debts (no payments = full balance)
  for (const debtId of debtIds) {
    if (!balances.has(debtId)) {
      const debt = debts.find((d) => d.id === debtId);
      if (debt) {
        balances.set(debtId, debt.original_amount_cents);
      }
    }
  }

  return balances;
}

// =====================================================
// Export all functions
// =====================================================

export { sumValidPayments, getReversedPaymentIds };
```

---

## Step 2: Create Status Transition Module

Create file: `src/lib/debts/status.ts`

```typescript
// src/lib/debts/status.ts
/**
 * Status Transition Logic
 *
 * Automatic status management based on balance:
 * - active → paid_off: balance ≤ 0
 * - paid_off → active: balance > 0 (reversal occurred)
 * - archived: terminal state (no auto transitions)
 */

import { db } from "@/lib/dexie/db";
import { calculateDebtBalance } from "./balance";
import type { DebtStatus } from "@/types/debt";

// =====================================================
// Status Transition Functions
// =====================================================

/**
 * Update debt status based on current balance
 *
 * Rules:
 * 1. balance ≤ 0 + status = active → paid_off (set closed_at)
 * 2. balance > 0 + status = paid_off → active (clear closed_at)
 * 3. status = archived → no change (terminal)
 *
 * @param debtId - Debt UUID
 * @param type - 'external' or 'internal'
 * @returns True if status changed
 *
 * @example
 * await updateDebtStatusFromBalance('debt-123', 'external');
 * // If balance = 0, status becomes 'paid_off'
 */
export async function updateDebtStatusFromBalance(
  debtId: string,
  type: "external" | "internal"
): Promise<boolean> {
  // 1. Calculate current balance
  const balance = await calculateDebtBalance(debtId, type);

  // 2. Get current debt record
  const table = type === "external" ? db.debts : db.internalDebts;
  const debt = await table.get(debtId);

  if (!debt) {
    console.warn(`[Status] Debt not found: ${debtId}`);
    return false;
  }

  // 3. Determine target status
  const currentStatus = debt.status;
  let targetStatus: DebtStatus = currentStatus;

  if (currentStatus === "archived") {
    // Terminal state - no automatic transitions
    return false;
  }

  if (balance <= 0 && currentStatus === "active") {
    // Transition: active → paid_off
    targetStatus = "paid_off";
  } else if (balance > 0 && currentStatus === "paid_off") {
    // Transition: paid_off → active (reversal occurred)
    targetStatus = "active";
  }

  // 4. Update status if changed
  if (targetStatus !== currentStatus) {
    const updates: any = {
      status: targetStatus,
      updated_at: new Date().toISOString(),
    };

    // Set closed_at when transitioning to paid_off
    if (targetStatus === "paid_off") {
      updates.closed_at = new Date().toISOString();
    }

    // Clear closed_at when reactivating
    if (targetStatus === "active" && currentStatus === "paid_off") {
      updates.closed_at = null;
    }

    await table.update(debtId, updates);

    console.log(`[Status] ${debt.name}: ${currentStatus} → ${targetStatus} (balance: ${balance})`);

    return true; // Status changed
  }

  return false; // No change needed
}

/**
 * Get expected status based on balance (without updating)
 *
 * @param balance - Current balance in cents
 * @param currentStatus - Current status
 * @returns Expected status based on balance
 */
export function getExpectedStatus(balance: number, currentStatus: DebtStatus): DebtStatus {
  if (currentStatus === "archived") {
    return "archived"; // Terminal state
  }

  if (balance <= 0) {
    return "paid_off";
  }

  return "active";
}

/**
 * Check if status transition is valid
 *
 * @param from - Current status
 * @param to - Target status
 * @returns True if transition is allowed
 */
export function isValidStatusTransition(from: DebtStatus, to: DebtStatus): boolean {
  // Same status - always valid
  if (from === to) return true;

  // From archived - only manual transitions allowed (handled elsewhere)
  if (from === "archived") return false;

  // Automatic transitions
  const validTransitions: Record<DebtStatus, DebtStatus[]> = {
    active: ["paid_off", "archived"],
    paid_off: ["active", "archived"],
    archived: [], // Terminal
  };

  return validTransitions[from]?.includes(to) ?? false;
}

// =====================================================
// Bulk Status Updates
// =====================================================

/**
 * Update status for multiple debts (batch operation)
 *
 * @param debtIds - Array of debt UUIDs
 * @param type - 'external' or 'internal'
 * @returns Number of debts updated
 */
export async function updateMultipleDebtStatuses(
  debtIds: string[],
  type: "external" | "internal"
): Promise<number> {
  let updateCount = 0;

  for (const debtId of debtIds) {
    const updated = await updateDebtStatusFromBalance(debtId, type);
    if (updated) updateCount++;
  }

  return updateCount;
}

// =====================================================
// State Recovery (fix inconsistent states)
// =====================================================

/**
 * Recover invalid debt states (run periodically or on app start)
 *
 * Fixes scenarios:
 * - Balance ≤ 0 but status = active
 * - Balance > 0 but status = paid_off
 *
 * @param type - 'external' or 'internal'
 * @returns Number of debts fixed
 */
export async function recoverInvalidDebtStates(type: "external" | "internal"): Promise<number> {
  console.log(`[Recovery] Scanning ${type} debts for invalid states`);

  const table = type === "external" ? db.debts : db.internalDebts;
  const debts = await table.toArray();

  let fixedCount = 0;

  for (const debt of debts) {
    // Skip archived debts (terminal state)
    if (debt.status === "archived") continue;

    const balance = await calculateDebtBalance(debt.id, type);
    const expectedStatus = getExpectedStatus(balance, debt.status);

    if (expectedStatus !== debt.status) {
      console.warn(
        `[Recovery] Fixing ${debt.name}: status=${debt.status} but balance=${balance} (expected=${expectedStatus})`
      );

      await table.update(debt.id, {
        status: expectedStatus,
        closed_at: expectedStatus === "paid_off" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      });

      fixedCount++;
    }

    // Log overpayments for visibility
    if (balance < 0) {
      console.info(`[Recovery] Debt ${debt.name} is overpaid by ${Math.abs(balance)} cents`);
    }
  }

  console.log(`[Recovery] Fixed ${fixedCount} inconsistent ${type} debt states`);

  return fixedCount;
}
```

---

## Step 3: Create Unit Tests for Balance Calculation

Create file: `src/lib/debts/__tests__/balance.test.ts`

```typescript
// src/lib/debts/__tests__/balance.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  calculateDebtBalance,
  calculateDebtBalanceWithDetails,
  calculateMultipleBalances,
} from "../balance";
import type { Debt, DebtPayment } from "@/types/debt";

describe("Balance Calculation", () => {
  beforeEach(async () => {
    // Clear database before each test
    await db.debts.clear();
    await db.debtPayments.clear();
  });

  describe("calculateDebtBalance", () => {
    it("should return full balance when no payments exist", async () => {
      const debt: Debt = {
        id: "debt-1",
        household_id: "household-1",
        name: "Test Debt",
        original_amount_cents: 100000, // ₱1,000
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await db.debts.add(debt);

      const balance = await calculateDebtBalance("debt-1", "external");
      expect(balance).toBe(100000); // Full balance
    });

    it("should calculate balance with single payment", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 25000, // ₱250 paid
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
      });

      const balance = await calculateDebtBalance("debt-1", "external");
      expect(balance).toBe(75000); // ₱1,000 - ₱250 = ₱750
    });

    it("should calculate balance with multiple payments", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.bulkAdd([
        {
          id: "payment-1",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-1",
          amount_cents: 25000,
          payment_date: "2025-11-01",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
        },
        {
          id: "payment-2",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-2",
          amount_cents: 30000,
          payment_date: "2025-11-05",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
        },
      ]);

      const balance = await calculateDebtBalance("debt-1", "external");
      expect(balance).toBe(45000); // ₱1,000 - ₱250 - ₱300 = ₱450
    });

    it("should exclude reversal records from calculation", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.bulkAdd([
        {
          id: "payment-1",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-1",
          amount_cents: 25000, // Original payment
          payment_date: "2025-11-01",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
        },
        {
          id: "reversal-1",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-1",
          amount_cents: -25000, // Reversal (negative)
          payment_date: "2025-11-02",
          device_id: "device-1",
          is_reversal: true,
          reverses_payment_id: "payment-1",
          created_at: new Date().toISOString(),
        },
      ]);

      const balance = await calculateDebtBalance("debt-1", "external");
      expect(balance).toBe(100000); // Both excluded, back to full balance
    });

    it("should support negative balance (overpayment)", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000, // ₱1,000
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 150000, // ₱1,500 paid (overpaid by ₱500)
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        is_overpayment: true,
        overpayment_amount: 50000,
        created_at: new Date().toISOString(),
      });

      const balance = await calculateDebtBalance("debt-1", "external");
      expect(balance).toBe(-50000); // Overpaid by ₱500
    });

    it("should return 0 for non-existent debt", async () => {
      const balance = await calculateDebtBalance("non-existent", "external");
      expect(balance).toBe(0);
    });
  });

  describe("calculateDebtBalanceWithDetails", () => {
    it("should return detailed breakdown", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.bulkAdd([
        {
          id: "payment-1",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-1",
          amount_cents: 30000,
          payment_date: "2025-11-01",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
        },
        {
          id: "payment-2",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-2",
          amount_cents: 20000,
          payment_date: "2025-11-05",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
        },
      ]);

      const details = await calculateDebtBalanceWithDetails("debt-1", "external");

      expect(details.original_amount_cents).toBe(100000);
      expect(details.total_paid_cents).toBe(50000);
      expect(details.current_balance_cents).toBe(50000);
      expect(details.payment_count).toBe(2);
      expect(details.reversal_count).toBe(0);
      expect(details.is_overpaid).toBe(false);
      expect(details.overpayment_amount_cents).toBe(0);
    });

    it("should detect overpayment in details", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 125000, // Overpaid
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
      });

      const details = await calculateDebtBalanceWithDetails("debt-1", "external");

      expect(details.is_overpaid).toBe(true);
      expect(details.overpayment_amount_cents).toBe(25000); // ₱250 over
      expect(details.current_balance_cents).toBe(-25000);
    });
  });

  describe("calculateMultipleBalances", () => {
    it("should calculate balances for multiple debts efficiently", async () => {
      // Add 3 debts
      await db.debts.bulkAdd([
        {
          id: "debt-1",
          household_id: "household-1",
          name: "Debt 1",
          original_amount_cents: 100000,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "debt-2",
          household_id: "household-1",
          name: "Debt 2",
          original_amount_cents: 200000,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "debt-3",
          household_id: "household-1",
          name: "Debt 3",
          original_amount_cents: 150000,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      // Add payments for debt-1 and debt-2 (debt-3 has no payments)
      await db.debtPayments.bulkAdd([
        {
          id: "payment-1",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-1",
          amount_cents: 25000,
          payment_date: "2025-11-01",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
        },
        {
          id: "payment-2",
          household_id: "household-1",
          debt_id: "debt-2",
          transaction_id: "txn-2",
          amount_cents: 100000,
          payment_date: "2025-11-01",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
        },
      ]);

      const balances = await calculateMultipleBalances(["debt-1", "debt-2", "debt-3"], "external");

      expect(balances.get("debt-1")).toBe(75000); // 100k - 25k
      expect(balances.get("debt-2")).toBe(100000); // 200k - 100k
      expect(balances.get("debt-3")).toBe(150000); // No payments
    });
  });
});
```

---

## Step 4: Create Unit Tests for Status Transitions

Create file: `src/lib/debts/__tests__/status.test.ts`

```typescript
// src/lib/debts/__tests__/status.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  updateDebtStatusFromBalance,
  getExpectedStatus,
  isValidStatusTransition,
  recoverInvalidDebtStates,
} from "../status";

describe("Status Transitions", () => {
  beforeEach(async () => {
    await db.debts.clear();
    await db.debtPayments.clear();
  });

  describe("updateDebtStatusFromBalance", () => {
    it("should transition active → paid_off when balance reaches 0", async () => {
      // Create debt
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Add payment for full balance
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 100000, // Pays off fully
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
      });

      // Update status based on balance
      const changed = await updateDebtStatusFromBalance("debt-1", "external");

      expect(changed).toBe(true);

      const debt = await db.debts.get("debt-1");
      expect(debt?.status).toBe("paid_off");
      expect(debt?.closed_at).toBeDefined();
    });

    it("should transition paid_off → active when reversal creates balance", async () => {
      // Create paid-off debt
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "paid_off",
        closed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Add payment (to create paid-off state)
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-01",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
      });

      // Add reversal (creates balance again)
      await db.debtPayments.add({
        id: "reversal-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: -100000,
        payment_date: "2025-11-02",
        device_id: "device-1",
        is_reversal: true,
        reverses_payment_id: "payment-1",
        created_at: new Date().toISOString(),
      });

      // Update status
      const changed = await updateDebtStatusFromBalance("debt-1", "external");

      expect(changed).toBe(true);

      const debt = await db.debts.get("debt-1");
      expect(debt?.status).toBe("active");
      expect(debt?.closed_at).toBeNull();
    });

    it("should NOT auto-transition archived debts", async () => {
      // Create archived debt
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "archived",
        closed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Update status (should not change)
      const changed = await updateDebtStatusFromBalance("debt-1", "external");

      expect(changed).toBe(false);

      const debt = await db.debts.get("debt-1");
      expect(debt?.status).toBe("archived"); // Still archived
    });

    it("should handle overpayment (negative balance → paid_off)", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Overpay
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 150000, // Overpaid by ₱500
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        is_overpayment: true,
        overpayment_amount: 50000,
        created_at: new Date().toISOString(),
      });

      const changed = await updateDebtStatusFromBalance("debt-1", "external");

      expect(changed).toBe(true);

      const debt = await db.debts.get("debt-1");
      expect(debt?.status).toBe("paid_off"); // Even though overpaid
    });
  });

  describe("getExpectedStatus", () => {
    it("should return paid_off for zero balance", () => {
      expect(getExpectedStatus(0, "active")).toBe("paid_off");
    });

    it("should return paid_off for negative balance", () => {
      expect(getExpectedStatus(-5000, "active")).toBe("paid_off");
    });

    it("should return active for positive balance", () => {
      expect(getExpectedStatus(10000, "paid_off")).toBe("active");
    });

    it("should preserve archived status", () => {
      expect(getExpectedStatus(10000, "archived")).toBe("archived");
      expect(getExpectedStatus(0, "archived")).toBe("archived");
    });
  });

  describe("isValidStatusTransition", () => {
    it("should allow active → paid_off", () => {
      expect(isValidStatusTransition("active", "paid_off")).toBe(true);
    });

    it("should allow paid_off → active", () => {
      expect(isValidStatusTransition("paid_off", "active")).toBe(true);
    });

    it("should allow any → archived", () => {
      expect(isValidStatusTransition("active", "archived")).toBe(true);
      expect(isValidStatusTransition("paid_off", "archived")).toBe(true);
    });

    it("should NOT allow archived → any", () => {
      expect(isValidStatusTransition("archived", "active")).toBe(false);
      expect(isValidStatusTransition("archived", "paid_off")).toBe(false);
    });

    it("should allow same status", () => {
      expect(isValidStatusTransition("active", "active")).toBe(true);
      expect(isValidStatusTransition("paid_off", "paid_off")).toBe(true);
    });
  });

  describe("recoverInvalidDebtStates", () => {
    it("should fix debts with incorrect status", async () => {
      // Create debt with mismatched status (balance = 0 but status = active)
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Mismatched",
        original_amount_cents: 100000,
        status: "active", // Should be paid_off
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Add payment that fully pays off debt
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
      });

      // Run recovery
      const fixedCount = await recoverInvalidDebtStates("external");

      expect(fixedCount).toBe(1);

      const debt = await db.debts.get("debt-1");
      expect(debt?.status).toBe("paid_off"); // Fixed!
    });
  });
});
```

---

## Step 5: Run Tests

```bash
# Run balance calculation tests
npm test balance.test

# Run status transition tests
npm test status.test

# Run all debt tests
npm test src/lib/debts

# Expected output:
# ✓ Balance Calculation (8 tests)
# ✓ Status Transitions (11 tests)
# All tests passing
```

---

## Step 6: Verify in Browser Console

```typescript
import { db } from "@/lib/dexie/db";
import { calculateDebtBalance, calculateDebtBalanceWithDetails } from "@/lib/debts/balance";
import { updateDebtStatusFromBalance } from "@/lib/debts/status";

// Create test debt
await db.debts.add({
  id: "test-debt-1",
  household_id: "00000000-0000-0000-0000-000000000001",
  name: "Browser Test",
  original_amount_cents: 100000, // ₱1,000
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Check balance (no payments)
const balance1 = await calculateDebtBalance("test-debt-1", "external");
console.log("Balance with no payments:", balance1); // 100000

// Add payment
await db.debtPayments.add({
  id: "test-payment-1",
  household_id: "00000000-0000-0000-0000-000000000001",
  debt_id: "test-debt-1",
  transaction_id: "test-txn-1",
  amount_cents: 60000, // ₱600
  payment_date: "2025-11-10",
  device_id: "test-device",
  is_reversal: false,
  created_at: new Date().toISOString(),
});

// Check balance again
const balance2 = await calculateDebtBalance("test-debt-1", "external");
console.log("Balance after payment:", balance2); // 40000 (₱400 remaining)

// Get detailed breakdown
const details = await calculateDebtBalanceWithDetails("test-debt-1", "external");
console.log("Details:", details);

// Update status (should stay active since balance > 0)
await updateDebtStatusFromBalance("test-debt-1", "external");
const debt1 = await db.debts.get("test-debt-1");
console.log("Status after partial payment:", debt1?.status); // 'active'

// Pay off remaining balance
await db.debtPayments.add({
  id: "test-payment-2",
  household_id: "00000000-0000-0000-0000-000000000001",
  debt_id: "test-debt-1",
  transaction_id: "test-txn-2",
  amount_cents: 40000, // ₱400
  payment_date: "2025-11-11",
  device_id: "test-device",
  is_reversal: false,
  created_at: new Date().toISOString(),
});

// Check balance
const balance3 = await calculateDebtBalance("test-debt-1", "external");
console.log("Balance after full payoff:", balance3); // 0

// Update status (should transition to paid_off)
await updateDebtStatusFromBalance("test-debt-1", "external");
const debt2 = await db.debts.get("test-debt-1");
console.log("Status after payoff:", debt2?.status); // 'paid_off'
console.log("Closed at:", debt2?.closed_at); // Timestamp

// Cleanup
await db.debts.delete("test-debt-1");
await db.debtPayments.where("debt_id").equals("test-debt-1").delete();
```

---

## Verification Checklist

After completing implementation:

- [ ] `balance.ts` module created with 3+ functions
- [ ] `status.ts` module created with 4+ functions
- [ ] Balance calculation handles all payment types
- [ ] Reversal filtering works correctly (O(1) lookups)
- [ ] Negative balances supported (overpayments)
- [ ] Status transitions work automatically
- [ ] Archived status preserved (terminal)
- [ ] All unit tests pass (19+ tests)
- [ ] Browser console verification successful
- [ ] TypeScript compilation passes
- [ ] Functions exported correctly from modules

---

## Troubleshooting

See `VERIFICATION.md` for common issues and solutions.

**Next**: Proceed to `VERIFICATION.md` for comprehensive testing
