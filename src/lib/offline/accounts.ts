/**
 * Offline Account Mutations for Household Hub
 *
 * Implements offline-first account CRUD operations using IndexedDB via Dexie.
 * These functions enable users to create, update, and deactivate accounts while offline.
 * Changes are stored locally and will sync to Supabase when connectivity is restored.
 *
 * Key Patterns:
 * - Temporary IDs: Use `temp-${nanoid()}` format for offline-created entities
 * - Device Tracking: Include device_id from deviceManager for sync attribution
 * - Graceful Errors: Return structured results, never throw exceptions
 * - Household MVP: Hardcoded household_id for single-household mode
 * - Currency MVP: Hardcoded PHP currency code
 *
 * See instructions.md Step 3 (lines 267-371) for implementation details.
 *
 * @module offline/accounts
 */

import { nanoid } from "nanoid";
import { db, type LocalAccount } from "@/lib/dexie/db";
import type { AccountInput, OfflineOperationResult } from "./types";

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
 * Default account color (blue) if not provided.
 */
const DEFAULT_COLOR = "#3B82F6";

/**
 * Default account icon if not provided.
 */
const DEFAULT_ICON = "wallet";

/**
 * Creates a new account offline with temporary ID.
 *
 * The account is immediately written to IndexedDB and will be synced to
 * Supabase when connectivity is restored. The temporary ID will be replaced
 * with a permanent UUID during sync.
 *
 * Field Generation:
 * - id: `temp-${nanoid()}` - Temporary identifier replaced during sync
 * - household_id: Hardcoded for MVP single household mode
 * - currency_code: Hardcoded to "PHP" for MVP
 * - owner_user_id: Set to userId if visibility is "personal", undefined for "household"
 * - sort_order: Defaults to 0 if not provided
 * - color: Defaults to blue (#3B82F6) if not provided
 * - icon: Defaults to "wallet" if not provided
 * - created_at/updated_at: Current ISO timestamp
 *
 * Error Handling:
 * - IndexedDB quota exceeded: Returns error with quota message
 * - All errors logged to console but don't throw
 *
 * @param input - Account data from form (excluding generated fields)
 * @param userId - Authenticated user ID from auth store
 * @returns Promise resolving to result with success status and data/error
 *
 * @example
 * const result = await createOfflineAccount(
 *   {
 *     name: "BDO Checking",
 *     type: "bank",
 *     initial_balance_cents: 500000, // ₱5,000.00
 *     visibility: "household",
 *     color: "#1E40AF",
 *     icon: "bank",
 *     is_active: true,
 *   },
 *   "user-123"
 * );
 *
 * if (result.success) {
 *   console.log("Account created:", result.data.id);
 * }
 */
export async function createOfflineAccount(
  input: AccountInput,
  userId: string
): Promise<OfflineOperationResult<LocalAccount>> {
  try {
    // Generate temporary ID (will be replaced with UUID during sync)
    const tempId = `temp-${nanoid()}`;
    const now = new Date().toISOString();

    // Map AccountInput → LocalAccount by adding generated fields
    const account: LocalAccount = {
      id: tempId,
      household_id: DEFAULT_HOUSEHOLD_ID,
      name: input.name,
      type: input.type === "e-wallet" ? "cash" : input.type, // Map e-wallet to cash for MVP
      initial_balance_cents: input.initial_balance_cents,
      currency_code: DEFAULT_CURRENCY_CODE,
      visibility: input.visibility,
      owner_user_id: input.visibility === "personal" ? userId : undefined,
      color: input.color || DEFAULT_COLOR,
      icon: input.icon || DEFAULT_ICON,
      sort_order: 0, // Default to 0, can be updated later
      is_active: input.is_active,
      created_at: now,
      updated_at: now,
    };

    // Write to IndexedDB
    await db.accounts.add(account);

    return {
      success: true,
      data: account,
      isTemporary: true, // Using temp ID
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
 * - Account must exist in IndexedDB
 * - Returns error if account not found
 *
 * Error Handling:
 * - Account not found: Returns error with "not found" message
 * - IndexedDB errors: Returns error with details
 * - All errors logged to console but don't throw
 *
 * @param id - Account ID (can be temporary or permanent)
 * @param updates - Partial account data to update
 * @returns Promise resolving to result with success status and data/error
 *
 * @example
 * const result = await updateOfflineAccount("temp-abc123", {
 *   name: "BDO Savings (Updated)",
 *   initial_balance_cents: 600000, // Updated balance
 * });
 *
 * if (result.success) {
 *   console.log("Account updated:", result.data.name);
 * }
 */
export async function updateOfflineAccount(
  id: string,
  updates: Partial<AccountInput>,
  userId: string
): Promise<OfflineOperationResult<LocalAccount>> {
  try {
    // Fetch existing account from IndexedDB
    const existing = await db.accounts.get(id);

    if (!existing) {
      return {
        success: false,
        error: `Account with ID "${id}" not found`,
        isTemporary: false,
      };
    }

    // Apply updates to existing account
    const updated: LocalAccount = {
      ...existing,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.type !== undefined && {
        type: updates.type === "e-wallet" ? "cash" : updates.type,
      }),
      ...(updates.initial_balance_cents !== undefined && {
        initial_balance_cents: updates.initial_balance_cents,
      }),
      ...(updates.visibility !== undefined && {
        visibility: updates.visibility,
      }),
      ...(updates.color !== undefined && { color: updates.color }),
      ...(updates.icon !== undefined && { icon: updates.icon }),
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

    // Write updated account back to IndexedDB
    await db.accounts.put(updated);

    return {
      success: true,
      data: updated,
      isTemporary: id.startsWith("temp-"),
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
 *
 * @example
 * const result = await deactivateOfflineAccount("temp-abc123");
 *
 * if (result.success) {
 *   console.log("Account deactivated:", result.data.name);
 * }
 */
export async function deactivateOfflineAccount(
  id: string,
  userId: string
): Promise<OfflineOperationResult<LocalAccount>> {
  return updateOfflineAccount(id, { is_active: false }, userId);
}
