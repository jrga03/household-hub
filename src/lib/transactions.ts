/**
 * Transaction CRUD Operations
 *
 * Placeholder file for transaction create/update/delete operations.
 * Will be implemented in future chunks with full event generation hooks.
 *
 * Implementation pattern:
 * 1. Get userId from authStore
 * 2. Perform mutation in Dexie
 * 3. For updates: Calculate delta with eventGenerator.calculateDelta()
 * 4. Call createTransactionEvent() to generate event
 * 5. Return result
 *
 * @module lib/transactions
 */

// import { nanoid } from "nanoid";
// import { db } from "./dexie/db";
// import { createTransactionEvent, eventGenerator } from "./event-generator";
// import { useAuthStore } from "@/stores/authStore";
import type { LocalTransaction } from "./dexie/db";

/**
 * Transaction input data (subset of LocalTransaction).
 */
export interface TransactionInput {
  household_id: string;
  date: string; // ISO date string
  description: string;
  amount_cents: number;
  type: "income" | "expense";
  currency_code: string;
  account_id?: string;
  category_id?: string;
  transfer_group_id?: string;
  status: "pending" | "cleared";
  visibility: "household" | "personal";
  owner_user_id?: string;
  tagged_user_ids?: string[];
  notes?: string;
  import_key?: string;
}

/**
 * Create a new transaction.
 *
 * TODO: Implement transaction creation with event generation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Create transaction in Dexie
 * 3. Generate event with createTransactionEvent('create', ...)
 * 4. Return created transaction
 *
 * @param data Transaction input data
 * @returns Promise resolving to created transaction
 * @throws Error if not authenticated
 *
 * @example
 * const transaction = await createTransaction({
 *   household_id: '...',
 *   date: '2025-01-15',
 *   description: 'Groceries',
 *   amount_cents: 100000,
 *   type: 'expense',
 *   currency_code: 'PHP',
 *   status: 'pending',
 *   visibility: 'household',
 * });
 */
export async function createTransaction(_data: TransactionInput): Promise<LocalTransaction> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // const deviceId = await deviceManager.getDeviceId();
  //
  // const transaction: LocalTransaction = {
  //   ...data,
  //   id: nanoid(),
  //   device_id: deviceId,
  //   created_by_user_id: userId,
  //   created_at: new Date().toISOString(),
  //   updated_at: new Date().toISOString(),
  //   tagged_user_ids: data.tagged_user_ids || [],
  // };
  //
  // await db.transactions.add(transaction);
  //
  // // Generate event
  // await createTransactionEvent("create", transaction.id, transaction, userId);
  //
  // return transaction;

  throw new Error("createTransaction not yet implemented");
}

/**
 * Update an existing transaction.
 *
 * TODO: Implement transaction update with delta calculation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Get old transaction from Dexie
 * 3. Update transaction in Dexie
 * 4. Get updated transaction from Dexie
 * 5. Calculate delta with eventGenerator.calculateDelta()
 * 6. Generate event with createTransactionEvent('update', ...)
 * 7. Return updated transaction
 *
 * @param id Transaction ID
 * @param changes Partial transaction data (only changed fields)
 * @returns Promise resolving to updated transaction
 * @throws Error if not authenticated or transaction not found
 *
 * @example
 * const updated = await updateTransaction('tx-123', {
 *   description: 'Updated description',
 *   status: 'cleared',
 * });
 */
export async function updateTransaction(
  _id: string,
  _changes: Partial<LocalTransaction>
): Promise<LocalTransaction> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // const oldTransaction = await db.transactions.get(id);
  // if (!oldTransaction) throw new Error("Transaction not found");
  //
  // await db.transactions.update(id, {
  //   ...changes,
  //   updated_at: new Date().toISOString(),
  // });
  //
  // const newTransaction = await db.transactions.get(id);
  // if (!newTransaction) throw new Error("Transaction not found after update");
  //
  // const delta = eventGenerator.calculateDelta(oldTransaction, newTransaction);
  //
  // // Generate event
  // await createTransactionEvent("update", id, delta, userId);
  //
  // return newTransaction;

  throw new Error("updateTransaction not yet implemented");
}

/**
 * Delete a transaction (soft delete).
 *
 * TODO: Implement transaction deletion with event generation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Delete transaction from Dexie
 * 3. Generate event with createTransactionEvent('delete', ...)
 *
 * Note: For transfer transactions, both paired transactions should be deleted.
 *
 * @param id Transaction ID
 * @returns Promise that resolves when deletion completes
 * @throws Error if not authenticated
 *
 * @example
 * await deleteTransaction('tx-123');
 */
export async function deleteTransaction(_id: string): Promise<void> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // await db.transactions.delete(id);
  //
  // // Generate event
  // await createTransactionEvent("delete", id, { deleted: true }, userId);

  throw new Error("deleteTransaction not yet implemented");
}
