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
