/**
 * Offline Operation Types for Household Hub
 *
 * Defines input types and result wrappers for offline-first mutations.
 * These types are used by offline mutation functions to create/update/delete
 * entities in IndexedDB before eventual sync to Supabase.
 *
 * Key Patterns:
 * - Input types omit generated fields (id, timestamps, device_id)
 * - Result types include success/error information for graceful degradation
 * - isTemporary flag indicates if entity uses a temp ID
 *
 * @see instructions.md Step 1
 * @module offline/types
 */

/**
 * Input type for creating transactions offline
 *
 * Omits generated fields that will be added by mutation functions:
 * - id (generated as temp-${nanoid()})
 * - created_at/updated_at (auto-generated timestamps)
 * - device_id (from deviceManager)
 * - household_id (hardcoded for MVP)
 * - created_by_user_id (from auth store)
 * - owner_user_id (derived from visibility)
 */
export interface TransactionInput {
  date: string; // ISO date string (DATE type)
  description: string;
  amount_cents: number;
  type: "income" | "expense";
  account_id?: string;
  category_id?: string;
  status: "pending" | "cleared";
  visibility: "household" | "personal";
  notes?: string;
  tagged_user_ids?: string[];
  transfer_group_id?: string | null;
  debt_id?: string;
  internal_debt_id?: string;
}

/**
 * Input type for creating accounts offline
 *
 * Omits generated fields similar to TransactionInput.
 * Note: type field uses different values than LocalAccount in db.ts
 * because it needs to match the database schema enum exactly.
 */
export interface AccountInput {
  name: string;
  type: "bank" | "investment" | "credit_card" | "cash" | "e-wallet";
  visibility: "household" | "personal";
  initial_balance_cents: number;
  color?: string;
  icon?: string;
  is_active: boolean;
}

/**
 * Input type for creating categories offline
 *
 * Supports two-level hierarchy via optional parent_id field.
 */
export interface CategoryInput {
  name: string;
  parent_id?: string | null;
  color?: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
}

/**
 * Offline operation result wrapper
 *
 * Provides structured error handling for offline mutations.
 * Success case includes data, error case includes error message.
 *
 * @template T - The entity type being returned (Transaction, Account, Category, etc.)
 *
 * @example Success case
 * {
 *   success: true,
 *   data: { id: "temp-abc123", ... },
 *   isTemporary: true
 * }
 *
 * @example Error case
 * {
 *   success: false,
 *   error: "IndexedDB quota exceeded",
 *   isTemporary: false
 * }
 */
export interface OfflineOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  isTemporary: boolean; // True if using temporary ID
}
