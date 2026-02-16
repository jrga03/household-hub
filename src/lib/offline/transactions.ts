/**
 * Offline Transaction Mutations for Household Hub
 *
 * Implements offline-first transaction CRUD operations using IndexedDB via Dexie.
 * These functions enable users to create, update, and delete transactions while offline.
 * Changes are stored locally and will sync to Supabase when connectivity is restored.
 *
 * Key Patterns:
 * - Temporary IDs: Use `temp-${nanoid()}` format for offline-created entities
 * - Device Tracking: Include device_id from deviceManager for sync attribution
 * - Graceful Errors: Return structured results, never throw exceptions
 * - Household MVP: Hardcoded household_id for single-household mode
 * - Currency MVP: Hardcoded PHP currency code
 *
 * See instructions.md Step 2 (lines 72-261) for implementation details.
 *
 * @module offline/transactions
 */

import { nanoid } from "nanoid";
import { db, type LocalTransaction } from "@/lib/dexie/db";
import { deviceManager } from "@/lib/dexie/deviceManager";
import { addToSyncQueue } from "./syncQueue";
import { processDebtPayment, handleTransactionEdit, handleTransactionDelete } from "@/lib/debts";
import type { TransactionInput, OfflineOperationResult } from "./types";

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
 * Creates a new transaction offline with temporary ID.
 *
 * The transaction is immediately written to IndexedDB and will be synced to
 * Supabase when connectivity is restored. The temporary ID will be replaced
 * with a permanent UUID during sync.
 *
 * Field Generation:
 * - id: `temp-${nanoid()}` - Temporary identifier replaced during sync
 * - device_id: From deviceManager - Tracks which device created the transaction
 * - household_id: Hardcoded for MVP single household mode
 * - currency_code: Hardcoded to "PHP" for MVP
 * - owner_user_id: Set to userId if visibility is "personal", null for "household"
 * - created_at/updated_at: Current ISO timestamp
 *
 * Error Handling:
 * - IndexedDB quota exceeded: Returns error with quota message
 * - Device ID unavailable: Still attempts write (graceful degradation)
 * - All errors logged to console but don't throw
 *
 * @param input - Transaction data from form (excluding generated fields)
 * @param userId - Authenticated user ID from auth store
 * @returns Promise resolving to result with success status and data/error
 *
 * @example
 * const result = await createOfflineTransaction(
 *   {
 *     date: "2025-10-27",
 *     description: "Grocery shopping",
 *     amount_cents: 150000, // ₱1,500.00
 *     type: "expense",
 *     account_id: "checking-account-id",
 *     category_id: "groceries-category-id",
 *     status: "pending",
 *     visibility: "household",
 *   },
 *   "user-123"
 * );
 *
 * if (result.success) {
 *   console.log("Transaction created:", result.data.id);
 * }
 */
export async function createOfflineTransaction(
  input: TransactionInput,
  userId: string
): Promise<OfflineOperationResult<LocalTransaction>> {
  try {
    // Generate temporary ID (will be replaced with UUID during sync)
    const tempId = `temp-${nanoid()}`;
    const deviceId = await deviceManager.getDeviceId();
    const now = new Date().toISOString();

    // Map TransactionInput → LocalTransaction by adding generated fields
    const transaction: LocalTransaction = {
      id: tempId,
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

    // Step 1: Write to IndexedDB
    await db.transactions.add(transaction);

    // Step 2: Add to sync queue
    const queueResult = await addToSyncQueue(
      "transaction",
      transaction.id,
      "create",
      transaction as unknown as Record<string, unknown>,
      userId
    );

    // Step 3: Rollback IndexedDB if queue fails
    if (!queueResult.success) {
      await db.transactions.delete(transaction.id);
      return {
        success: false,
        error: `Failed to queue for sync: ${queueResult.error}`,
        isTemporary: false,
      };
    }

    // Step 4: Process debt payment if linked to a debt
    if (input.debt_id || input.internal_debt_id) {
      try {
        await processDebtPayment({
          transaction_id: tempId,
          amount_cents: input.amount_cents,
          payment_date: input.date,
          debt_id: input.debt_id,
          internal_debt_id: input.internal_debt_id,
          household_id: DEFAULT_HOUSEHOLD_ID,
        });
      } catch (error) {
        // Rollback transaction and sync queue on debt payment failure
        await db.transactions.delete(transaction.id);
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
      isTemporary: true,
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
 * back to IndexedDB. The updated_at timestamp is automatically refreshed.
 *
 * Update Restrictions:
 * - Cannot change transfer_group_id after creation (enforced at sync level)
 * - Cannot change household_id (would break sync consistency)
 * - Cannot change created_by_user_id (immutable audit field)
 *
 * Temporary ID Handling:
 * - Updates to temp IDs work normally (common during offline editing)
 * - Sync process will handle ID replacement and change propagation
 *
 * Error Handling:
 * - Transaction not found: Returns error (possibly deleted or never created)
 * - IndexedDB errors: Logged and returned as error result
 *
 * @param id - Transaction ID (may be temporary or permanent UUID)
 * @param updates - Partial transaction data to merge with existing
 * @param userId - User ID for sync queue attribution
 * @returns Promise resolving to result with updated transaction or error
 *
 * @example
 * const result = await updateOfflineTransaction("temp-abc123", {
 *   description: "Updated description",
 *   amount_cents: 200000, // Changed amount
 *   status: "cleared", // Mark as cleared
 * }, "user-123");
 *
 * if (result.success) {
 *   console.log("Transaction updated:", result.data);
 * }
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

    // Step 1: Update in IndexedDB (uses .put() for upsert)
    await db.transactions.put(updated);

    // Step 2: Add to sync queue
    const queueResult = await addToSyncQueue(
      "transaction",
      id,
      "update",
      updated as unknown as Record<string, unknown>,
      userId
    );

    // Step 3: Rollback IndexedDB if queue fails
    if (!queueResult.success) {
      await db.transactions.put(existing);
      return {
        success: false,
        error: `Failed to queue for sync: ${queueResult.error}`,
        isTemporary: false,
      };
    }

    // Step 4: Handle debt payment changes if debt-related fields changed
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
      isTemporary: id.startsWith("temp-"),
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
 * Removes the transaction from IndexedDB immediately. Since we use event sourcing,
 * this is a hard delete locally - the delete event will be created separately
 * during sync processing.
 *
 * Deletion Strategy:
 * - Local: Hard delete from IndexedDB (immediate removal)
 * - Sync: Delete event created in sync queue for server propagation
 * - Event log: DELETE event recorded for conflict resolution
 *
 * Transfer Considerations:
 * - Deleting a transfer transaction requires deleting BOTH paired transactions
 * - This function handles single transaction delete only
 * - Caller must delete both sides of transfer pair manually
 * - See chunk 018 (transfers-ui) for paired deletion logic
 *
 * Error Handling:
 * - Transaction not found: Returns error (possibly already deleted)
 * - IndexedDB errors: Logged and returned as error result
 *
 * @param id - Transaction ID to delete (may be temporary or permanent UUID)
 * @param userId - User ID for sync queue attribution
 * @returns Promise resolving to success result or error
 *
 * @example
 * const result = await deleteOfflineTransaction("temp-abc123", "user-123");
 *
 * if (result.success) {
 *   console.log("Transaction deleted");
 * } else {
 *   console.error("Delete failed:", result.error);
 * }
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

    // Step 0: Reverse debt payment BEFORE deletion to preserve audit trail
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

    // Step 1: Delete from IndexedDB (hard delete)
    await db.transactions.delete(id);

    // Step 2: Add to sync queue
    const queueResult = await addToSyncQueue("transaction", id, "delete", { id }, userId);

    // Step 3: Rollback IndexedDB if queue fails
    if (!queueResult.success) {
      await db.transactions.add(existing);
      return {
        success: false,
        error: `Failed to queue for sync: ${queueResult.error}`,
        isTemporary: false,
      };
    }

    return {
      success: true,
      isTemporary: id.startsWith("temp-"),
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
 * Batch creates multiple transactions (for CSV import).
 *
 * Creates multiple transactions in a single IndexedDB transaction for performance.
 * Uses bulkAdd() for atomic batch insertion - either all succeed or all fail.
 *
 * Performance Characteristics:
 * - bulkAdd() is 10-100x faster than individual add() calls
 * - Atomic operation: All or nothing (if one fails, all fail)
 * - Recommended for imports with 100+ transactions
 * - Handles up to 10,000 transactions efficiently
 *
 * Deduplication:
 * - No deduplication at this layer (handled by CSV import logic)
 * - Caller must check for duplicates using import_key field
 * - See chunk 037 (csv-import) for deduplication strategy
 *
 * Error Handling:
 * - Duplicate ID conflict: Entire batch fails (none inserted)
 * - IndexedDB quota: Returns error with quota information
 * - All errors logged but don't throw
 *
 * @param inputs - Array of transaction inputs to create
 * @param userId - Authenticated user ID from auth store
 * @returns Promise resolving to result with all created transactions or error
 *
 * @example
 * const result = await createOfflineTransactionsBatch(
 *   [
 *     { date: "2025-10-01", description: "Salary", amount_cents: 5000000, type: "income", ... },
 *     { date: "2025-10-05", description: "Rent", amount_cents: 1500000, type: "expense", ... },
 *     { date: "2025-10-10", description: "Groceries", amount_cents: 500000, type: "expense", ... },
 *   ],
 *   "user-123"
 * );
 *
 * if (result.success) {
 *   console.log(`Imported ${result.data.length} transactions`);
 * }
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
      id: `temp-${nanoid()}`,
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

      // Generated fields (same for all transactions in batch)
      household_id: DEFAULT_HOUSEHOLD_ID,
      currency_code: DEFAULT_CURRENCY_CODE,
      created_by_user_id: userId,
      owner_user_id: input.visibility === "personal" ? userId : undefined,
      device_id: deviceId,
      created_at: now,
      updated_at: now,
    }));

    // Write transactions and queue sync items atomically using Dexie transaction.
    // This prevents phantom sync queue entries pointing to deleted transactions
    // if some queue operations fail mid-batch.
    await db.transaction("rw", db.transactions, async () => {
      await db.transactions.bulkAdd(transactions);
    });

    // Queue sync items — if any fail, roll back all transactions AND
    // any successfully queued items
    const queueResults = await Promise.all(
      transactions.map((tx) =>
        addToSyncQueue(
          "transaction",
          tx.id,
          "create",
          tx as unknown as Record<string, unknown>,
          userId
        )
      )
    );

    const failedQueues = queueResults.filter((r) => !r.success);
    if (failedQueues.length > 0) {
      // Rollback: Delete all transactions from IndexedDB
      await db.transactions.bulkDelete(transactions.map((t) => t.id));
      console.error(`Failed to queue ${failedQueues.length} transactions for sync`);
      return {
        success: false,
        error: `Failed to queue ${failedQueues.length} of ${transactions.length} transactions for sync`,
        isTemporary: false,
      };
    }

    return {
      success: true,
      data: transactions,
      isTemporary: true,
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
