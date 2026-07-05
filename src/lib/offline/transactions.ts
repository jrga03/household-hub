/**
 * Offline Transaction Mutations for Household Hub
 *
 * Implements offline-first transaction CRUD operations using IndexedDB via Dexie.
 * These functions enable users to create, update, and delete transactions while offline.
 * Changes are stored locally and sync to Supabase when connectivity is restored.
 *
 * Key Patterns:
 * - Client UUIDs: crypto.randomUUID() at creation, so local ID == server ID
 *   (no temp-ID remapping; see review SYNC-03)
 * - Outbox atomicity: entity write + sync queue enqueue happen in ONE Dexie
 *   transaction, so there is no rollback choreography and no window where a
 *   mutation exists without its queue item (or vice versa)
 * - Device Tracking: Include device_id from deviceManager for sync attribution
 * - Graceful Errors: Return structured results, never throw exceptions
 * - Household MVP: Hardcoded household_id for single-household mode
 * - Currency MVP: Hardcoded PHP currency code
 *
 * @module offline/transactions
 */

import { db, type LocalTransaction } from "@/lib/dexie/db";
import { deviceManager } from "@/lib/dexie/deviceManager";
import { buildSyncQueueItem } from "./syncQueue";
import { processDebtPayment, handleTransactionEdit, handleTransactionDelete } from "@/lib/debts";
import type { TransactionInput, OfflineOperationResult } from "./types";
import type { SyncQueueItem } from "@/types/sync";

/**
 * Default household ID for MVP (single household mode).
 * See DECISIONS.md #61 for multi-household architecture deferral.
 */
const DEFAULT_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Default currency code for MVP (PHP only).
 * Multi-currency support deferred to Phase 2+.
 */
const DEFAULT_CURRENCY_CODE = "PHP";

/**
 * Creates a new transaction offline.
 *
 * The transaction and its sync queue item are written to IndexedDB in a
 * single Dexie transaction; the sync processor pushes it to Supabase when
 * online. The ID is a client-generated UUID that the server keeps, so no
 * ID remapping is ever needed.
 *
 * @param input - Transaction data from form (excluding generated fields)
 * @param userId - Authenticated user ID from auth store
 * @returns Promise resolving to result with success status and data/error
 */
export async function createOfflineTransaction(
  input: TransactionInput,
  userId: string
): Promise<OfflineOperationResult<LocalTransaction>> {
  try {
    const id = crypto.randomUUID();
    const deviceId = await deviceManager.getDeviceId();
    const now = new Date().toISOString();

    // Map TransactionInput → LocalTransaction by adding generated fields
    const transaction: LocalTransaction = {
      id,
      date: input.date,
      description: input.description,
      amount_cents: input.amount_cents,
      type: input.type,
      account_id: input.account_id || undefined,
      category_id: input.category_id || undefined,
      status: input.status,
      visibility: input.visibility,
      notes: input.notes || undefined,
      tagged_user_ids: input.tagged_user_ids || [],
      transfer_group_id: input.transfer_group_id || undefined,
      debt_id: input.debt_id || undefined,
      internal_debt_id: input.internal_debt_id || undefined,

      // Generated fields
      household_id: DEFAULT_HOUSEHOLD_ID,
      currency_code: DEFAULT_CURRENCY_CODE,
      created_by_user_id: userId,
      owner_user_id: input.visibility === "personal" ? userId : undefined,
      device_id: deviceId,
      created_at: now,
      updated_at: now,
    };

    // Sync metadata (clocks, idempotency key) is assembled BEFORE the Dexie
    // transaction: those helpers touch db.meta and platform APIs that are
    // not safe inside a transaction zone.
    const queueItem = await buildSyncQueueItem(
      "transaction",
      transaction.id,
      "create",
      transaction as unknown as Record<string, unknown>,
      userId
    );

    // Entity + outbox item commit together or not at all
    await db.transaction("rw", db.transactions, db.syncQueue, async () => {
      await db.transactions.add(transaction);
      await db.syncQueue.add(queueItem);
    });

    // Process debt payment if linked to a debt. This runs its own writes
    // (debt tables + events) and cannot join the transaction above, so on
    // failure we compensate by removing the transaction and its queue item.
    if (input.debt_id || input.internal_debt_id) {
      try {
        await processDebtPayment({
          transaction_id: id,
          amount_cents: input.amount_cents,
          payment_date: input.date,
          debt_id: input.debt_id,
          internal_debt_id: input.internal_debt_id,
          household_id: DEFAULT_HOUSEHOLD_ID,
        });
      } catch (error) {
        await db.transaction("rw", db.transactions, db.syncQueue, async () => {
          await db.transactions.delete(transaction.id);
          await db.syncQueue.delete(queueItem.id);
        });
        console.error("Failed to create debt payment:", error);
        return {
          success: false,
          error: `Failed to create debt payment: ${error instanceof Error ? error.message : "Unknown error"}`,
          isTemporary: false,
        };
      }
    }

    return {
      success: true,
      data: transaction,
      isTemporary: true, // pending sync
    };
  } catch (error) {
    console.error("Failed to create offline transaction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}

/**
 * Updates an existing transaction offline.
 *
 * Merges the provided updates with the existing transaction data and writes
 * the updated entity plus its sync queue item atomically.
 *
 * Update Restrictions:
 * - Cannot change transfer_group_id after creation (enforced at sync level)
 * - Cannot change household_id (would break sync consistency)
 * - Cannot change created_by_user_id (immutable audit field)
 *
 * @param id - Transaction UUID
 * @param updates - Partial transaction data to merge with existing
 * @param userId - User ID for sync queue attribution
 * @returns Promise resolving to result with updated transaction or error
 */
export async function updateOfflineTransaction(
  id: string,
  updates: Partial<TransactionInput>,
  userId: string
): Promise<OfflineOperationResult<LocalTransaction>> {
  try {
    // Get existing transaction
    const existing = await db.transactions.get(id);
    if (!existing) {
      return {
        success: false,
        error: "Transaction not found",
        isTemporary: false,
      };
    }

    // Merge updates with existing data
    // Convert null values to undefined for LocalTransaction compatibility
    const updated: LocalTransaction = {
      ...existing,
      ...updates,
      // Ensure null values are converted to undefined for optional fields
      account_id:
        updates.account_id === null ? undefined : (updates.account_id ?? existing.account_id),
      category_id:
        updates.category_id === null ? undefined : (updates.category_id ?? existing.category_id),
      notes: updates.notes === null ? undefined : (updates.notes ?? existing.notes),
      transfer_group_id:
        updates.transfer_group_id === null
          ? undefined
          : (updates.transfer_group_id ?? existing.transfer_group_id),
      tagged_user_ids: updates.tagged_user_ids ?? existing.tagged_user_ids,
      updated_at: new Date().toISOString(),
    };

    const queueItem = await buildSyncQueueItem(
      "transaction",
      id,
      "update",
      updated as unknown as Record<string, unknown>,
      userId
    );

    await db.transaction("rw", db.transactions, db.syncQueue, async () => {
      await db.transactions.put(updated);
      await db.syncQueue.add(queueItem);
    });

    // Handle debt payment changes if debt-related fields changed
    const debtFieldsChanged =
      updates.amount_cents !== undefined ||
      updates.debt_id !== undefined ||
      updates.internal_debt_id !== undefined ||
      updates.date !== undefined;

    if (debtFieldsChanged && (updated.debt_id || updated.internal_debt_id)) {
      try {
        await handleTransactionEdit({
          transaction_id: id,
          new_amount_cents: updated.amount_cents,
          new_debt_id: updated.debt_id,
          new_internal_debt_id: updated.internal_debt_id,
          payment_date: updated.date,
        });
      } catch (error) {
        console.error("Failed to adjust debt payment:", error);
        // Don't rollback the transaction update — the debt adjustment is secondary.
        // This is intentionally asymmetric with deleteOfflineTransaction (which blocks
        // on debt reversal failure) because a failed delete reversal would leave the
        // debt balance incorrect, while a failed update adjustment is recoverable.
      }
    }

    return {
      success: true,
      data: updated,
      isTemporary: true, // pending sync
    };
  } catch (error) {
    console.error("Failed to update offline transaction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}

/**
 * Deletes a transaction offline.
 *
 * Reverses any linked debt payment first (preserving the audit trail), then
 * removes the transaction and enqueues the delete atomically.
 *
 * Transfer Considerations:
 * - Deleting a transfer transaction requires deleting BOTH paired transactions
 * - This function handles single transaction delete only; on the server the
 *   handle_transfer_deletion trigger removes the sibling
 *
 * @param id - Transaction UUID to delete
 * @param userId - User ID for sync queue attribution
 * @returns Promise resolving to success result or error
 */
export async function deleteOfflineTransaction(
  id: string,
  userId: string
): Promise<OfflineOperationResult<void>> {
  try {
    // Verify transaction exists before attempting delete
    const existing = await db.transactions.get(id);
    if (!existing) {
      return {
        success: false,
        error: "Transaction not found",
        isTemporary: false,
      };
    }

    // Reverse debt payment BEFORE deletion to preserve audit trail
    try {
      await handleTransactionDelete({ transaction_id: id });
    } catch (error) {
      console.error("Failed to reverse debt payment:", error);
      return {
        success: false,
        error: `Failed to reverse debt payment: ${error instanceof Error ? error.message : "Unknown error"}`,
        isTemporary: false,
      };
    }

    const queueItem = await buildSyncQueueItem("transaction", id, "delete", { id }, userId);

    await db.transaction("rw", db.transactions, db.syncQueue, async () => {
      await db.transactions.delete(id);
      await db.syncQueue.add(queueItem);
    });

    return {
      success: true,
      isTemporary: true, // pending sync
    };
  } catch (error) {
    console.error("Failed to delete offline transaction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}

/**
 * Batch creates multiple transactions (for imports).
 *
 * All transactions AND their sync queue items are written in one Dexie
 * transaction: either the whole batch lands with its outbox entries, or
 * nothing does.
 *
 * Performance Characteristics:
 * - bulkAdd() is 10-100x faster than individual add() calls
 * - Recommended for imports with 100+ transactions
 * - Handles up to 10,000 transactions efficiently
 *
 * Deduplication:
 * - No deduplication at this layer (handled by import logic)
 * - Caller must check for duplicates using import_key field
 *
 * @param inputs - Array of transaction inputs to create
 * @param userId - Authenticated user ID from auth store
 * @returns Promise resolving to result with all created transactions or error
 */
export async function createOfflineTransactionsBatch(
  inputs: TransactionInput[],
  userId: string
): Promise<OfflineOperationResult<LocalTransaction[]>> {
  try {
    const deviceId = await deviceManager.getDeviceId();
    const now = new Date().toISOString();

    // Map all inputs to LocalTransaction objects
    const transactions: LocalTransaction[] = inputs.map((input) => ({
      id: crypto.randomUUID(),
      date: input.date,
      description: input.description,
      amount_cents: input.amount_cents,
      type: input.type,
      account_id: input.account_id || undefined,
      category_id: input.category_id || undefined,
      status: input.status,
      visibility: input.visibility,
      notes: input.notes || undefined,
      tagged_user_ids: input.tagged_user_ids || [],
      transfer_group_id: input.transfer_group_id || undefined,
      debt_id: input.debt_id || undefined,
      internal_debt_id: input.internal_debt_id || undefined,
      import_key: input.import_key || undefined,

      // Generated fields (same for all transactions in batch)
      household_id: DEFAULT_HOUSEHOLD_ID,
      currency_code: DEFAULT_CURRENCY_CODE,
      created_by_user_id: userId,
      owner_user_id: input.visibility === "personal" ? userId : undefined,
      device_id: deviceId,
      created_at: now,
      updated_at: now,
    }));

    // Assemble queue items sequentially (per-entity clock increments) before
    // opening the transaction
    const queueItems: SyncQueueItem[] = [];
    for (const tx of transactions) {
      queueItems.push(
        await buildSyncQueueItem(
          "transaction",
          tx.id,
          "create",
          tx as unknown as Record<string, unknown>,
          userId
        )
      );
    }

    await db.transaction("rw", db.transactions, db.syncQueue, async () => {
      await db.transactions.bulkAdd(transactions);
      await db.syncQueue.bulkAdd(queueItems);
    });

    return {
      success: true,
      data: transactions,
      isTemporary: true, // pending sync
    };
  } catch (error) {
    console.error("Failed to batch create offline transactions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}
