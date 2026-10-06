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
 *     await handleTransactionEdit(
 *       {
 *         transaction_id: id,
 *         new_amount_cents: updates.amount_cents,
 *         new_debt_id: updates.debt_id,
 *         payment_date: updates.date,
 *       },
 *       userId
 *     );
 *   }
 * }
 *
 * // When user deletes transaction
 * async function deleteTransaction(id) {
 *   // 1. Handle debt payment reversal FIRST
 *   await handleTransactionDelete({ transaction_id: id }, userId);
 *
 *   // 2. Delete transaction
 *   await db.transactions.delete(id);
 * }
 * ```
 *
 * ## Cascading Reversals (signed ledger)
 *
 * A reversal is ALWAYS a linked compensating row whose amount is the exact
 * negation of its target, so chains of any depth work uniformly:
 * - Original payment: +₱500
 * - First reversal:   -₱500, reverses_payment_id → original
 * - Second reversal:  +₱500, reverses_payment_id → first reversal
 *
 * Because the link is always set, "has this row been reversed?" and the
 * reversal idempotency check work identically at every depth. (The previous
 * exclusion-based model stripped the link from reversal-of-reversal rows,
 * which made re-reversing them non-idempotent; review DEBT-02.)
 *
 * @module reversals
 */

import { format } from "date-fns";
import { db } from "@/lib/dexie/db";
import { negateCents } from "@/lib/currency";
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
import { prepareDebtPayment } from "./payments";
import { nextDebtStatus } from "./status";
import type {
  Debt,
  InternalDebt,
  DebtPayment,
  CreateReversalData,
  ReversalResult,
  TransactionEditData,
  TransactionDeleteData,
} from "@/types/debt";

export interface PreparedReversal {
  writeSet: DebtWriteSet;
  result: ReversalResult;
}

export async function prepareReversal(
  data: CreateReversalData,
  userId: string,
  view = new DebtLedgerView()
): Promise<PreparedReversal> {
  const originalPayment = await db.debtPayments.get(data.payment_id);
  if (!originalPayment) {
    throw new Error(`Payment ${data.payment_id} not found`);
  }
  const debtType: DebtKind = originalPayment.debt_id ? "external" : "internal";
  const debtId = originalPayment.debt_id ?? originalPayment.internal_debt_id;
  if (!debtId) {
    throw new Error(`Payment ${data.payment_id} is not linked to a debt`);
  }

  const existingReversal = await db.debtPayments
    .where("reverses_payment_id")
    .equals(data.payment_id)
    .first();
  if (existingReversal) {
    return {
      writeSet: emptyWriteSet(),
      result: {
        reversal: existingReversal,
        originalPayment,
        newBalance: await view.balance(debtType, debtId),
        statusChanged: false,
        newStatus: undefined,
      },
    };
  }

  const debt = await view.debt(debtType, debtId);
  if (debt?.status === "archived") {
    console.warn(`Reversing payment on archived debt ${debtId}. Status will change to active.`);
  }

  const now = new Date().toISOString();
  // Always the exact negation of its target, linked at any cascade depth
  const reversal: DebtPayment = {
    id: crypto.randomUUID(),
    household_id: originalPayment.household_id,
    debt_id: originalPayment.debt_id,
    internal_debt_id: originalPayment.internal_debt_id,
    transaction_id: originalPayment.transaction_id,
    amount_cents: negateCents(originalPayment.amount_cents),
    payment_date: format(new Date(), "yyyy-MM-dd"),
    is_reversal: true,
    reverses_payment_id: data.payment_id,
    adjustment_reason: data.reason,
    is_overpayment: false,
    overpayment_amount: undefined,
    device_id: await getDeviceId(),
    created_at: now,
    updated_at: now,
  };
  const reversalWrite = await preparePaymentAdd(reversal, userId);

  const balanceBefore = await view.balance(debtType, debtId);
  view.recordPayment(debtId, reversal.amount_cents);
  const newBalance = balanceBefore - reversal.amount_cents;

  let statusChange: Debt | InternalDebt | null = null;
  if (debt) {
    statusChange =
      debt.status === "archived"
        ? newBalance > 0
          ? { ...debt, status: "active", closed_at: undefined, updated_at: now }
          : null
        : nextDebtStatus(debt, newBalance, now);
  }
  let statusWrite = emptyWriteSet();
  if (debt && statusChange) {
    statusWrite = await prepareDebtUpdate(debt, statusChange, userId);
    view.setDebt(statusChange);
  }

  return {
    writeSet: mergeWriteSets(reversalWrite, statusWrite),
    result: {
      reversal,
      originalPayment,
      newBalance,
      statusChanged: statusChange !== null,
      newStatus: (statusChange ?? debt)?.status,
    },
  };
}

export async function reverseDebtPayment(
  data: CreateReversalData,
  userId: string
): Promise<ReversalResult> {
  const { writeSet, result } = await prepareReversal(data, userId);
  await commitDebtWriteSet(writeSet);
  return result;
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

type TransactionDebtOperation = {
  type: "reversal" | "payment";
  record: DebtPayment;
  debtId: string;
  debtType: DebtKind;
};

export interface PreparedTransactionEdit {
  writeSet: DebtWriteSet;
  operations: TransactionDebtOperation[];
  reversalCreated: boolean;
  paymentCreated: boolean;
}

/** Edit as reverse-and-create: reverse the live payment, then pay the new amount/debt. */
export async function prepareTransactionEdit(
  data: TransactionEditData,
  userId: string
): Promise<PreparedTransactionEdit> {
  const view = new DebtLedgerView();
  const operations: TransactionDebtOperation[] = [];
  const writeSets: DebtWriteSet[] = [];

  const rows = await db.debtPayments.where("transaction_id").equals(data.transaction_id).toArray();
  const reversedIds = new Set(
    rows.flatMap((p) => (p.reverses_payment_id ? [p.reverses_payment_id] : []))
  );
  const regular = rows.filter((p) => !p.is_reversal);
  regular.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const existingPayment = regular.find((p) => !reversedIds.has(p.id)) ?? regular[0];

  if (existingPayment) {
    const { writeSet, result } = await prepareReversal(
      { payment_id: existingPayment.id, reason: "transaction_edited" },
      userId,
      view
    );
    writeSets.push(writeSet);
    const oldDebtId = existingPayment.debt_id ?? existingPayment.internal_debt_id;
    if (oldDebtId) {
      operations.push({
        type: "reversal",
        record: result.reversal,
        debtId: oldDebtId,
        debtType: existingPayment.debt_id ? "external" : "internal",
      });
    }
  }

  const newDebtId = data.new_debt_id ?? data.new_internal_debt_id;
  const newAmount = data.new_amount_cents;
  if (newDebtId && newAmount && newAmount > 0) {
    const newDebtType: DebtKind = data.new_debt_id ? "external" : "internal";
    const debt = await view.debt(newDebtType, newDebtId);
    if (!debt) {
      throw new Error(`Debt ${newDebtId} not found`);
    }
    const { writeSet, result } = await prepareDebtPayment(
      {
        transaction_id: data.transaction_id,
        amount_cents: newAmount,
        payment_date: data.payment_date,
        debt_id: newDebtType === "external" ? newDebtId : undefined,
        internal_debt_id: newDebtType === "internal" ? newDebtId : undefined,
        household_id: debt.household_id,
      },
      userId,
      view
    );
    writeSets.push(writeSet);
    operations.push({
      type: "payment",
      record: result.payment,
      debtId: newDebtId,
      debtType: newDebtType,
    });
  }

  return {
    writeSet: mergeWriteSets(...writeSets),
    operations,
    reversalCreated: operations.some((op) => op.type === "reversal"),
    paymentCreated: operations.some((op) => op.type === "payment"),
  };
}

export async function handleTransactionEdit(data: TransactionEditData, userId: string) {
  const { writeSet, ...outcome } = await prepareTransactionEdit(data, userId);
  await commitDebtWriteSet(writeSet);
  return outcome;
}

/** Reverses every live payment of a deleted transaction (normally exactly one). */
export async function prepareTransactionDelete(
  data: TransactionDeleteData,
  userId: string
): Promise<{ writeSet: DebtWriteSet; result: ReversalResult | undefined }> {
  const rows = await db.debtPayments.where("transaction_id").equals(data.transaction_id).toArray();
  const reversedIds = new Set(
    rows.flatMap((p) => (p.reverses_payment_id ? [p.reverses_payment_id] : []))
  );
  const livePayments = rows.filter((p) => !p.is_reversal && !reversedIds.has(p.id));

  const view = new DebtLedgerView();
  const writeSets: DebtWriteSet[] = [];
  let result: ReversalResult | undefined;
  for (const payment of livePayments) {
    const prepared = await prepareReversal(
      { payment_id: payment.id, reason: "transaction_deleted" },
      userId,
      view
    );
    writeSets.push(prepared.writeSet);
    result = prepared.result;
  }
  return { writeSet: mergeWriteSets(...writeSets), result };
}

export async function handleTransactionDelete(
  data: TransactionDeleteData,
  userId: string
): Promise<ReversalResult | undefined> {
  const { writeSet, result } = await prepareTransactionDelete(data, userId);
  await commitDebtWriteSet(writeSet);
  return result;
}
