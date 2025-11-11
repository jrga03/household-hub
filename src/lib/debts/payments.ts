/**
 * Debt Payment Processing
 *
 * Core logic for creating debt payments linked to transactions
 * Includes overpayment detection, idempotency keys, and status updates
 */

import { nanoid } from "nanoid";
import { db } from "@/lib/dexie/db";
import { getNextLamportClock } from "@/lib/dexie/lamport-clock";
import { getDeviceId } from "@/lib/device";
import { calculateDebtBalance } from "./balance";
import { updateDebtStatusFromBalance } from "./status";
import { createDebtPaymentEvent } from "./events";
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
  // Used for event sourcing and server-side deduplication
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

    // Event sourcing (idempotency key for deduplication)
    idempotency_key: idempotencyKey,

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Insert payment
  await db.debtPayments.add(payment);

  // Create event (for event sourcing & sync)
  await createDebtPaymentEvent(payment, "create");

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
