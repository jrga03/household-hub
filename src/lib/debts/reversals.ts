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

import { nanoid } from "nanoid";
import { db } from "@/lib/dexie/db";
import { getDeviceId } from "@/lib/device";
import { getNextLamportClock } from "@/lib/dexie/lamport-clock";
import { calculateDebtBalance } from "./balance";
import { updateDebtStatusFromBalance } from "./status";
import { processDebtPayment } from "./payments";
import { createDebtPaymentEvent } from "./events";
import type {
  DebtPayment,
  CreateReversalData,
  ReversalResult,
  TransactionEditData,
  TransactionDeleteData,
} from "@/types/debt";

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
  // IMPORTANT: When reversing a reversal (double negative), the resulting positive
  // payment should NOT be marked as a reversal, otherwise balance calculation will exclude it
  const reversal: DebtPayment = {
    id: reversalId,
    household_id: originalPayment.household_id,
    debt_id: originalPayment.debt_id,
    internal_debt_id: originalPayment.internal_debt_id,
    transaction_id: originalPayment.transaction_id, // Link to same transaction
    amount_cents: reversalAmount,
    payment_date: new Date().toISOString().split("T")[0], // Today's date
    is_reversal: !isReversingReversal, // Regular payment if reversing a reversal
    reverses_payment_id: isReversingReversal ? undefined : data.payment_id, // Only set if actual reversal
    adjustment_reason: data.reason,
    is_overpayment: false, // Reversals never overpayments
    overpayment_amount: undefined,
    device_id: deviceId,
    idempotency_key: idempotencyKey,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 8. Insert reversal
  await db.debtPayments.add(reversal);

  // 9. Create event (for event sourcing & sync)
  await createDebtPaymentEvent(reversal, "create");

  // 10. Recalculate balance and update status
  const newBalance = await calculateDebtBalance(debtId, debtType);

  // Special handling for archived debts - unarchive them when reversal occurs
  let statusChanged = false;
  if (debt?.status === "archived" && newBalance > 0) {
    // Unarchive the debt back to active
    const table = debtType === "external" ? db.debts : db.internalDebts;
    await table.update(debtId, {
      status: "active",
      closed_at: null,
      updated_at: new Date().toISOString(),
    });
    statusChanged = true;
    console.log(`[Status] ${debt.name}: archived → active (reversal on archived debt)`);
  } else {
    // Normal status update based on balance
    statusChanged = await updateDebtStatusFromBalance(debtId, debtType);
  }

  // Get the updated debt to find the new status
  const updatedDebt =
    debtType === "external" ? await db.debts.get(debtId) : await db.internalDebts.get(debtId);

  return {
    reversal,
    originalPayment,
    newBalance,
    statusChanged,
    newStatus: updatedDebt?.status,
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
