/**
 * Transaction Mutations with Debt Integration
 *
 * This module provides transaction CRUD operations that integrate with the debt tracking system.
 * When transactions are linked to debts, appropriate payment records are created/updated/reversed.
 *
 * ## Key Integration Points
 *
 * 1. **Create**: If debt link provided, calls `processDebtPayment` after transaction creation
 * 2. **Update**: If debt fields changed, calls `handleTransactionEdit` to reverse/recreate payments
 * 3. **Delete**: Calls `handleTransactionDelete` BEFORE deletion to preserve audit trail
 *
 * ## Usage Example
 *
 * ```typescript
 * import { createTransaction, updateTransaction, deleteTransaction } from '@/lib/transactions/mutations';
 *
 * // Create transaction with debt link
 * const transaction = await createTransaction({
 *   amount_cents: 50000,
 *   date: '2025-11-10',
 *   description: 'Car loan payment',
 *   type: 'expense',
 *   debt_id: 'debt-123',
 *   household_id: 'h1',
 * });
 * // → Transaction created + payment record created automatically
 *
 * // Update transaction amount
 * await updateTransaction(transaction.id, { amount_cents: 30000 });
 * // → Old payment reversed, new payment created
 *
 * // Delete transaction
 * await deleteTransaction(transaction.id);
 * // → Payment reversed (balance restored), then transaction deleted
 * ```
 *
 * @module transactions/mutations
 */

import { nanoid } from "nanoid";
import { db } from "@/lib/dexie/db";
import { processDebtPayment, handleTransactionEdit, handleTransactionDelete } from "@/lib/debts";
import type { LocalTransaction } from "@/lib/dexie/db";
import type { TransactionFormData } from "@/lib/validations/transaction";

// =====================================================
// Create Transaction
// =====================================================

/**
 * Create new transaction with optional debt link
 *
 * If debt_id or internal_debt_id provided, automatically creates debt payment record
 * via processDebtPayment from D5 (Payment Processing chunk).
 *
 * @param data - Transaction form data
 * @returns Created transaction
 * @throws Error if debt payment creation fails
 */
export async function createTransaction(
  data: TransactionFormData & { household_id: string }
): Promise<LocalTransaction> {
  // Generate transaction ID
  const transactionId = nanoid();

  // Create transaction record
  const transaction: LocalTransaction = {
    id: transactionId,
    household_id: data.household_id,
    date: typeof data.date === "string" ? data.date : data.date.toISOString().split("T")[0],
    description: data.description,
    amount_cents: data.amount_cents,
    type: data.type,
    currency_code: "PHP", // MVP: PHP only
    account_id: data.account_id || undefined,
    category_id: data.category_id || undefined,
    transfer_group_id: data.transfer_group_id,
    debt_id: data.debt_id,
    internal_debt_id: data.internal_debt_id,
    status: data.status,
    visibility: data.visibility,
    created_by_user_id: "", // TODO: Get from auth context
    tagged_user_ids: [],
    notes: data.notes || undefined,
    device_id: "", // TODO: Get from device ID service
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Insert transaction into IndexedDB
  await db.transactions.add(transaction);

  console.log(
    `[Transaction Created] ${transaction.description} - ₱${(transaction.amount_cents / 100).toFixed(2)}`
  );

  // =====================================================
  // Debt Payment Integration
  // =====================================================
  // If transaction is linked to a debt, create payment record
  if (data.debt_id || data.internal_debt_id) {
    try {
      const paymentDate =
        typeof data.date === "string" ? data.date : data.date.toISOString().split("T")[0];

      const paymentResult = await processDebtPayment({
        transaction_id: transactionId,
        amount_cents: data.amount_cents,
        payment_date: paymentDate,
        debt_id: data.debt_id,
        internal_debt_id: data.internal_debt_id,
        household_id: data.household_id,
      });

      console.log(
        `[Debt Payment Created] ₱${(data.amount_cents / 100).toFixed(2)} linked to debt`,
        paymentResult.wasOverpayment ? "(OVERPAYMENT)" : ""
      );
    } catch (error) {
      console.error("[Debt Payment Failed]", error);
      // Rollback transaction creation
      await db.transactions.delete(transactionId);
      throw new Error(
        `Failed to create debt payment: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return transaction;
}

// =====================================================
// Update Transaction
// =====================================================

/**
 * Update existing transaction with debt reversal/recreation
 *
 * If debt-related fields changed (amount_cents, debt_id, internal_debt_id, date),
 * calls handleTransactionEdit to reverse old payment and create new one.
 *
 * Operation Order:
 * 1. Update transaction in database
 * 2. Handle debt payment changes (if applicable)
 *
 * This ensures payment records always reflect current transaction state.
 *
 * @param id - Transaction ID to update
 * @param updates - Fields to update
 * @returns Updated transaction
 * @throws Error if transaction not found or debt handling fails
 */
export async function updateTransaction(
  id: string,
  updates: Partial<TransactionFormData>
): Promise<LocalTransaction> {
  // Get existing transaction
  const existing = await db.transactions.get(id);

  if (!existing) {
    throw new Error(`Transaction ${id} not found`);
  }

  // Prepare updated transaction
  const updated: LocalTransaction = {
    ...existing,
    // Update fields if provided
    ...(updates.date && {
      date:
        typeof updates.date === "string" ? updates.date : updates.date.toISOString().split("T")[0],
    }),
    ...(updates.description && { description: updates.description }),
    ...(updates.amount_cents !== undefined && { amount_cents: updates.amount_cents }),
    ...(updates.type && { type: updates.type }),
    ...(updates.account_id !== undefined && { account_id: updates.account_id || undefined }),
    ...(updates.category_id !== undefined && { category_id: updates.category_id || undefined }),
    ...(updates.debt_id !== undefined && { debt_id: updates.debt_id || undefined }),
    ...(updates.internal_debt_id !== undefined && {
      internal_debt_id: updates.internal_debt_id || undefined,
    }),
    ...(updates.status && { status: updates.status }),
    ...(updates.notes !== undefined && { notes: updates.notes || undefined }),
    updated_at: new Date().toISOString(),
  };

  // Update transaction in IndexedDB
  await db.transactions.update(id, updated);

  console.log(`[Transaction Updated] ${updated.description}`);

  // =====================================================
  // Debt Payment Integration
  // =====================================================
  // Check if debt-related fields changed
  const debtFieldsChanged =
    updates.amount_cents !== undefined ||
    updates.debt_id !== undefined ||
    updates.internal_debt_id !== undefined ||
    updates.date !== undefined;

  if (debtFieldsChanged) {
    try {
      const paymentDate = updated.date;

      await handleTransactionEdit({
        transaction_id: id,
        new_amount_cents: updated.amount_cents,
        new_debt_id: updated.debt_id,
        new_internal_debt_id: updated.internal_debt_id,
        payment_date: paymentDate,
      });

      console.log(`[Debt Payment Adjusted] Transaction ${id}`);
    } catch (error) {
      console.error("[Debt Payment Adjustment Failed]", error);
      throw new Error(
        `Failed to adjust debt payment: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return updated;
}

// =====================================================
// Delete Transaction
// =====================================================

/**
 * Delete transaction with debt payment reversal
 *
 * Operation Order (CRITICAL):
 * 1. Reverse debt payment FIRST (if linked) to preserve audit trail
 * 2. Delete transaction from database
 *
 * This ensures payment reversals are recorded before the transaction is removed,
 * maintaining complete audit trail and correct debt balances.
 *
 * @param id - Transaction ID to delete
 * @throws Error if transaction not found or reversal fails
 */
export async function deleteTransaction(id: string): Promise<void> {
  // Verify transaction exists
  const existing = await db.transactions.get(id);

  if (!existing) {
    throw new Error(`Transaction ${id} not found`);
  }

  // =====================================================
  // Debt Payment Reversal (FIRST)
  // =====================================================
  // If transaction was linked to debt, reverse the payment
  try {
    const reversalResult = await handleTransactionDelete({
      transaction_id: id,
    });

    if (reversalResult) {
      console.log(
        `[Debt Payment Reversed] ₱${(reversalResult.originalPayment.amount_cents / 100).toFixed(2)} restored to debt`
      );
    }
  } catch (error) {
    console.error("[Debt Payment Reversal Failed]", error);
    throw new Error(
      `Failed to reverse debt payment: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }

  // =====================================================
  // Delete Transaction (SECOND)
  // =====================================================
  await db.transactions.delete(id);

  console.log(`[Transaction Deleted] ${existing.description}`);
}
