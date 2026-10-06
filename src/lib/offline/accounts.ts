/**
 * Offline Account Mutations for Household Hub
 *
 * Implements offline-first account CRUD operations using IndexedDB via Dexie.
 * These functions enable users to create, update, and deactivate accounts while offline.
 * Changes are stored locally and will sync to Supabase when connectivity is restored.
 *
 * Key Patterns:
 * - Client UUIDs: crypto.randomUUID() at creation, so local ID == server ID
 * - Outbox atomicity: entity write + sync queue enqueue in ONE Dexie transaction
 * - Graceful Errors: Return structured results, never throw exceptions
 * - Household MVP: Hardcoded household_id for single-household mode
 * - Currency MVP: Hardcoded PHP currency code
 *
 * @module offline/accounts
 */

import { db, type LocalAccount } from "@/lib/dexie/db";
import { buildSyncQueueItem } from "./syncQueue";
import { ensureLocalRow } from "./ensureLocal";
import { duplicateAccountNameError } from "./duplicateNames";
import type { AccountInput, OfflineOperationResult } from "./types";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";

/**
 * Default currency code for MVP (PHP only).
 * Multi-currency support deferred to Phase 2+.
 */
const DEFAULT_CURRENCY_CODE = "PHP";

/**
 * Default account color (blue) if not provided.
 */
const DEFAULT_COLOR = "#3B82F6";

/**
 * Default account icon if not provided.
 */
const DEFAULT_ICON = "wallet";

function householdAccounts(householdId: string): Promise<LocalAccount[]> {
  return db.accounts.filter((account) => account.household_id === householdId).toArray();
}

/**
 * Creates a new account offline.
 *
 * The account and its sync queue item are written to IndexedDB in one Dexie
 * transaction and synced to Supabase when online. The ID is a client UUID
 * that the server keeps.
 *
 * Field Generation:
 * - id: crypto.randomUUID()
 * - household_id: Hardcoded for MVP single household mode
 * - currency_code: Hardcoded to "PHP" for MVP
 * - owner_user_id: Set to userId if visibility is "personal", undefined for "household"
 * - sort_order: Defaults to 0 if not provided
 * - color: Defaults to blue (#3B82F6) if not provided
 * - icon: Defaults to "wallet" if not provided
 * - created_at/updated_at: Current ISO timestamp
 *
 * Error Handling:
 * - Duplicate active name in the household: Returns a readable error
 * - IndexedDB errors: Returns error with details
 * - All errors logged to console but don't throw
 *
 * @param input - Account data from form (excluding generated fields)
 * @param userId - Authenticated user ID from auth store
 * @returns Promise resolving to result with success status and data/error
 */
export async function createOfflineAccount(
  input: AccountInput,
  userId: string
): Promise<OfflineOperationResult<LocalAccount>> {
  try {
    const duplicateError = duplicateAccountNameError(
      await householdAccounts(DEFAULT_HOUSEHOLD_ID),
      input.name
    );
    if (duplicateError) {
      return { success: false, error: duplicateError, isTemporary: false };
    }

    const now = new Date().toISOString();

    // Map AccountInput → LocalAccount by adding generated fields
    const account: LocalAccount = {
      id: crypto.randomUUID(),
      household_id: DEFAULT_HOUSEHOLD_ID,
      name: input.name,
      type: input.type,
      initial_balance_cents: input.initial_balance_cents,
      currency_code: DEFAULT_CURRENCY_CODE,
      visibility: input.visibility,
      owner_user_id: input.visibility === "personal" ? userId : undefined,
      color: input.color || DEFAULT_COLOR,
      icon: input.icon || DEFAULT_ICON,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
      created_at: now,
      updated_at: now,
    };

    // Sync metadata assembled before the Dexie transaction (see syncQueue.ts)
    const queueItem = await buildSyncQueueItem(
      "account",
      account.id,
      "create",
      account as unknown as Record<string, unknown>,
      userId
    );

    // Entity + outbox item commit together or not at all
    await db.transaction("rw", db.accounts, db.syncQueue, async () => {
      await db.accounts.add(account);
      await db.syncQueue.add(queueItem);
    });

    return {
      success: true,
      data: account,
      isTemporary: true, // pending sync
    };
  } catch (error) {
    console.error("Failed to create offline account:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create account offline",
      isTemporary: false,
    };
  }
}

/**
 * Updates an existing account offline.
 *
 * Fetches the current account from IndexedDB, applies the updates, and writes
 * the modified account back. The updated_at timestamp is automatically refreshed.
 *
 * Field Updates:
 * - Only fields present in `updates` are modified
 * - owner_user_id is recalculated if visibility changes
 * - updated_at is always refreshed to current timestamp
 * - All other fields remain unchanged
 *
 * Validation:
 * - Account must exist locally or on the server
 * - A rename must not collide with another active account in the household
 *
 * Error Handling:
 * - Account not found: Returns error with "not found" message
 * - IndexedDB errors: Returns error with details
 * - All errors logged to console but don't throw
 *
 * @param id - Account ID
 * @param updates - Partial account data to update
 * @returns Promise resolving to result with success status and data/error
 */
export async function updateOfflineAccount(
  id: string,
  updates: Partial<AccountInput>,
  userId: string
): Promise<OfflineOperationResult<LocalAccount>> {
  try {
    // Fetch existing account from IndexedDB
    const existing = await ensureLocalRow("accounts", id);

    if (!existing) {
      return {
        success: false,
        error: `Account with ID "${id}" not found`,
        isTemporary: false,
      };
    }

    if (updates.name !== undefined && updates.name !== existing.name) {
      const duplicateError = duplicateAccountNameError(
        await householdAccounts(existing.household_id),
        updates.name,
        id
      );
      if (duplicateError) {
        return { success: false, error: duplicateError, isTemporary: false };
      }
    }

    // Apply updates to existing account
    const updated: LocalAccount = {
      ...existing,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.type !== undefined && { type: updates.type }),
      ...(updates.initial_balance_cents !== undefined && {
        initial_balance_cents: updates.initial_balance_cents,
      }),
      ...(updates.visibility !== undefined && {
        visibility: updates.visibility,
      }),
      ...(updates.color !== undefined && { color: updates.color }),
      ...(updates.icon !== undefined && { icon: updates.icon }),
      ...(updates.sort_order !== undefined && { sort_order: updates.sort_order }),
      ...(updates.is_active !== undefined && {
        is_active: updates.is_active,
      }),
      updated_at: new Date().toISOString(),
    };

    // Recalculate owner_user_id if visibility changed
    if (updates.visibility !== undefined && updates.visibility !== existing.visibility) {
      if (updates.visibility === "personal") {
        // Set owner to current user when changing to personal visibility
        updated.owner_user_id = userId;
      } else {
        // visibility === "household" - clear owner
        updated.owner_user_id = undefined;
      }
    }

    const queueItem = await buildSyncQueueItem(
      "account",
      id,
      "update",
      updated as unknown as Record<string, unknown>,
      userId
    );

    await db.transaction("rw", db.accounts, db.syncQueue, async () => {
      await db.accounts.put(updated);
      await db.syncQueue.add(queueItem);
    });

    return {
      success: true,
      data: updated,
      isTemporary: true, // pending sync
    };
  } catch (error) {
    console.error("Failed to update offline account:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update account offline",
      isTemporary: false,
    };
  }
}

/**
 * Deactivates an account offline (soft delete).
 *
 * This is a convenience wrapper around updateOfflineAccount that sets
 * is_active to false. Deactivated accounts are hidden from the UI but
 * remain in the database for historical transaction integrity.
 *
 * Implementation Note:
 * - Calls updateOfflineAccount with `{ is_active: false }`
 * - Inherits all error handling from updateOfflineAccount
 * - Returns same result structure as updateOfflineAccount
 *
 * Design Rationale:
 * - Soft delete preserves historical data integrity
 * - Prevents orphaned transactions with invalid account_id
 * - Supports account reactivation if needed
 *
 * @param id - Account ID to deactivate
 * @returns Promise resolving to result with success status and data/error
 */
export async function deactivateOfflineAccount(
  id: string,
  userId: string
): Promise<OfflineOperationResult<LocalAccount>> {
  return updateOfflineAccount(id, { is_active: false }, userId);
}
