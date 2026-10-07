/**
 * Debt Payment Processing
 *
 * Core logic for creating debt payments linked to transactions
 * Includes overpayment detection, idempotency keys, and status updates
 */

import { db } from "@/lib/dexie/db";
import { ZERO_CENTS, diffCents } from "@/lib/currency";
import { getDeviceId } from "@/lib/dexie/deviceManager";
import { DebtLedgerView } from "./ledgerView";
import {
  commitDebtWriteSet,
  emptyWriteSet,
  mergeWriteSets,
  prepareDebtUpdate,
  preparePaymentAdd,
  type DebtKind,
  type DebtWriteSet,
} from "./outbox";
import { nextDebtStatus } from "./status";
import type { DebtPayment, ProcessPaymentData, PaymentResult } from "@/types/debt";

// =====================================================
// Payment Processing
// =====================================================

export interface PreparedPayment {
  writeSet: DebtWriteSet;
  result: PaymentResult;
}

/** DEFENSE-IN-DEPTH LAYER 2 for overpayment (UI warns first, the DB trigger recomputes). */
export async function prepareDebtPayment(
  data: ProcessPaymentData,
  userId: string,
  view = new DebtLedgerView()
): Promise<PreparedPayment> {
  if (data.debt_id && data.internal_debt_id) {
    throw new Error("Cannot specify both debt_id and internal_debt_id");
  }
  const debtId = data.debt_id ?? data.internal_debt_id;
  if (!debtId) {
    throw new Error("Must specify either debt_id or internal_debt_id");
  }
  if (data.amount_cents <= 0) {
    throw new Error("Payment amount must be positive");
  }
  const debtType: DebtKind = data.debt_id ? "external" : "internal";

  const debt = await view.debt(debtType, debtId);
  if (!debt) {
    throw new Error("Debt not found");
  }
  if (debt.status === "archived") {
    throw new Error("Cannot make payment to archived debt");
  }

  const currentBalance = await view.balance(debtType, debtId);
  const isOverpayment = currentBalance <= 0 || data.amount_cents > currentBalance;
  const overpaymentAmount = !isOverpayment
    ? ZERO_CENTS
    : currentBalance > 0
      ? diffCents(data.amount_cents, currentBalance)
      : data.amount_cents;

  const now = new Date().toISOString();
  const payment: DebtPayment = {
    id: crypto.randomUUID(),
    household_id: data.household_id,
    debt_id: data.debt_id,
    internal_debt_id: data.internal_debt_id,
    transaction_id: data.transaction_id,
    amount_cents: data.amount_cents,
    payment_date: data.payment_date,
    device_id: await getDeviceId(),
    is_reversal: false,
    is_overpayment: isOverpayment,
    overpayment_amount: isOverpayment ? overpaymentAmount : undefined,
    created_at: now,
    updated_at: now,
  };
  const paymentWrite = await preparePaymentAdd(payment, userId);

  view.recordPayment(debtId, data.amount_cents);
  const newBalance = currentBalance - data.amount_cents;
  const statusChange = nextDebtStatus(debt, newBalance, now);
  let statusWrite = emptyWriteSet();
  if (statusChange) {
    statusWrite = await prepareDebtUpdate(debt, statusChange, userId);
    view.setDebt(statusChange);
  }

  return {
    writeSet: mergeWriteSets(paymentWrite, statusWrite),
    result: {
      payment,
      wasOverpayment: isOverpayment,
      overpaymentAmount,
      newBalance,
      statusChanged: statusChange !== null,
      newStatus: (statusChange ?? debt).status,
    },
  };
}

export async function processDebtPayment(
  data: ProcessPaymentData,
  userId: string
): Promise<PaymentResult> {
  const { writeSet, result } = await prepareDebtPayment(data, userId);
  await commitDebtWriteSet(writeSet);
  console.log(
    `[Payment Created] ₱${(data.amount_cents / 100).toFixed(2)} for debt ${data.debt_id ?? data.internal_debt_id}`,
    result.wasOverpayment ? "(OVERPAYMENT)" : ""
  );
  return result;
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
