/**
 * Balance Calculation Logic (signed ledger)
 *
 * Core principle: Balance is DERIVED from payment history, never stored.
 * Formula: current_balance = original_amount - SUM(ALL payment rows)
 *
 * Rows are SIGNED: regular payments are positive, compensating rows
 * (reversals) are negative, and a reversal of a reversal is a positive
 * compensating row. Every row participates in the sum, which makes the
 * model uniform and matches the server schema's design ("Positive for
 * payment, negative for reversal", debt_payments.amount_cents).
 *
 * (The previous EXCLUSION-based model summed only "valid" rows and skipped
 * reversal pairs. It forced reversal-of-reversal rows to masquerade as
 * regular unlinked payments, which broke reversal idempotency and the audit
 * chain; see docs/reviews/2026-07-02-architecture-review.md DEBT-02/13.)
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

  // 3. Signed sum over ALL rows (reversals are negative)
  return debt.original_amount_cents - sumPayments(payments);
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

  // Signed totals
  const totalPaid = sumPayments(payments);
  const balance = debt.original_amount_cents - totalPaid;

  // Live payments = regular rows whose effect still stands (not compensated)
  const reversedIds = getReversedPaymentIds(payments);
  const livePayments = payments.filter((p) => !p.is_reversal && !reversedIds.has(p.id));
  const reversals = payments.filter((p) => p.is_reversal);

  // Overpayment detection
  const isOverpaid = balance < 0;
  const overpaymentAmount = isOverpaid ? Math.abs(balance) : 0;

  return {
    original_amount_cents: debt.original_amount_cents,
    total_paid_cents: totalPaid,
    current_balance_cents: balance,
    payment_count: livePayments.length,
    reversal_count: reversals.length,
    is_overpaid: isOverpaid,
    overpayment_amount_cents: overpaymentAmount,
  };
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Signed sum over ALL payment rows.
 *
 * No exclusions: a reversed payment (+P) and its reversal (-P) cancel
 * arithmetically, so the ledger stays uniform and reversal chains of any
 * depth work without special cases.
 */
function sumPayments(payments: DebtPayment[]): number {
  return payments.reduce((sum, p) => sum + p.amount_cents, 0);
}

/**
 * Get set of payment IDs that have been compensated by another row
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
    balances.set(debt.id, debt.original_amount_cents - sumPayments(payments));
  }

  return balances;
}

// =====================================================
// Export helpers (tests, sibling modules)
// =====================================================

export { sumPayments, getReversedPaymentIds };
