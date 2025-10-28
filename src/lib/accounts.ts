/**
 * Account CRUD Operations
 *
 * Placeholder file for account create/update/delete operations.
 * Will be implemented in future chunks with full event generation hooks.
 *
 * Implementation pattern:
 * 1. Get userId from authStore
 * 2. Perform mutation in Dexie
 * 3. For updates: Calculate delta with eventGenerator.calculateDelta()
 * 4. Call createAccountEvent() to generate event
 * 5. Return result
 *
 * @module lib/accounts
 */

// import { nanoid } from "nanoid";
// import { db } from "./dexie/db";
// import { createAccountEvent, eventGenerator } from "./event-generator";
// import { useAuthStore } from "@/stores/authStore";
import type { LocalAccount } from "./dexie/db";

/**
 * Account input data (subset of LocalAccount).
 */
export interface AccountInput {
  household_id: string;
  name: string;
  type: "bank" | "investment" | "credit_card" | "cash";
  initial_balance_cents: number;
  currency_code: string;
  visibility: "household" | "personal";
  owner_user_id?: string;
  color: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

/**
 * Create a new account.
 *
 * TODO: Implement account creation with event generation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Create account in Dexie
 * 3. Generate event with createAccountEvent('create', ...)
 * 4. Return created account
 *
 * @param data Account input data
 * @returns Promise resolving to created account
 * @throws Error if not authenticated
 *
 * @example
 * const account = await createAccount({
 *   household_id: '...',
 *   name: 'Savings Account',
 *   type: 'bank',
 *   initial_balance_cents: 1000000,
 *   currency_code: 'PHP',
 *   visibility: 'household',
 *   color: '#4CAF50',
 *   icon: 'bank',
 *   sort_order: 0,
 *   is_active: true,
 * });
 */
export async function createAccount(_data: AccountInput): Promise<LocalAccount> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // const account: LocalAccount = {
  //   ...data,
  //   id: nanoid(),
  //   created_at: new Date().toISOString(),
  //   updated_at: new Date().toISOString(),
  // };
  //
  // await db.accounts.add(account);
  //
  // // Generate event
  // await createAccountEvent("create", account.id, account, userId);
  //
  // return account;

  throw new Error("createAccount not yet implemented");
}

/**
 * Update an existing account.
 *
 * TODO: Implement account update with delta calculation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Get old account from Dexie
 * 3. Update account in Dexie
 * 4. Get updated account from Dexie
 * 5. Calculate delta with eventGenerator.calculateDelta()
 * 6. Generate event with createAccountEvent('update', ...)
 * 7. Return updated account
 *
 * @param id Account ID
 * @param changes Partial account data (only changed fields)
 * @returns Promise resolving to updated account
 * @throws Error if not authenticated or account not found
 *
 * @example
 * const updated = await updateAccount('acc-123', {
 *   name: 'Updated Account Name',
 *   is_active: false,
 * });
 */
export async function updateAccount(
  _id: string,
  _changes: Partial<LocalAccount>
): Promise<LocalAccount> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // const oldAccount = await db.accounts.get(id);
  // if (!oldAccount) throw new Error("Account not found");
  //
  // await db.accounts.update(id, {
  //   ...changes,
  //   updated_at: new Date().toISOString(),
  // });
  //
  // const newAccount = await db.accounts.get(id);
  // if (!newAccount) throw new Error("Account not found after update");
  //
  // const delta = eventGenerator.calculateDelta(oldAccount, newAccount);
  //
  // // Generate event
  // await createAccountEvent("update", id, delta, userId);
  //
  // return newAccount;

  throw new Error("updateAccount not yet implemented");
}

/**
 * Delete an account (soft delete by setting is_active: false).
 *
 * TODO: Implement account deletion with event generation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Update account in Dexie (set is_active: false)
 * 3. Generate event with createAccountEvent('delete', ...)
 *
 * Note: Accounts should not be hard-deleted due to transaction references.
 * Use soft delete (is_active: false) instead.
 *
 * @param id Account ID
 * @returns Promise that resolves when deletion completes
 * @throws Error if not authenticated
 *
 * @example
 * await deleteAccount('acc-123');
 */
export async function deleteAccount(_id: string): Promise<void> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // // Soft delete: Set is_active to false
  // await db.accounts.update(id, {
  //   is_active: false,
  //   updated_at: new Date().toISOString(),
  // });
  //
  // // Generate event
  // await createAccountEvent("delete", id, { is_active: false }, userId);

  throw new Error("deleteAccount not yet implemented");
}
