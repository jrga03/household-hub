/**
 * Budget CRUD Operations
 *
 * Placeholder file for budget create/update/delete operations.
 * Will be implemented in future chunks with full event generation hooks.
 *
 * Implementation pattern:
 * 1. Get userId from authStore
 * 2. Perform mutation in Dexie
 * 3. For updates: Calculate delta with eventGenerator.calculateDelta()
 * 4. Call createBudgetEvent() to generate event
 * 5. Return result
 *
 * Note: Budgets are reference targets only (not balances).
 * See DECISIONS.md #12, #79 for budget system design.
 *
 * @module lib/budgets
 */

// import { nanoid } from "nanoid";
// import { db } from "./dexie/db";
// import { createBudgetEvent, eventGenerator } from "./event-generator";
// import { useAuthStore } from "@/stores/authStore";

/**
 * Budget record (will match future Dexie schema).
 *
 * TODO: Add LocalBudget interface to src/lib/dexie/db.ts when budgets table is implemented.
 */
export interface LocalBudget {
  id: string;
  household_id: string;
  category_id: string;
  month_key: string; // Format: YYYY-MM (e.g., '2025-01')
  amount_cents: number; // Budget target (reference only)
  created_at: string;
  updated_at: string;
}

/**
 * Budget input data (subset of LocalBudget).
 */
export interface BudgetInput {
  household_id: string;
  category_id: string;
  month_key: string;
  amount_cents: number;
}

/**
 * Create a new budget.
 *
 * TODO: Implement budget creation with event generation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Create budget in Dexie
 * 3. Generate event with createBudgetEvent('create', ...)
 * 4. Return created budget
 *
 * Note: Budgets are monthly reference targets, not running balances.
 *
 * @param data Budget input data
 * @returns Promise resolving to created budget
 * @throws Error if not authenticated
 *
 * @example
 * const budget = await createBudget({
 *   household_id: '...',
 *   category_id: 'cat-123',
 *   month_key: '2025-01',
 *   amount_cents: 50000,
 * });
 */
export async function createBudget(_data: BudgetInput): Promise<LocalBudget> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // const budget: LocalBudget = {
  //   ...data,
  //   id: nanoid(),
  //   created_at: new Date().toISOString(),
  //   updated_at: new Date().toISOString(),
  // };
  //
  // await db.budgets.add(budget);
  //
  // // Generate event
  // await createBudgetEvent("create", budget.id, budget, userId);
  //
  // return budget;

  throw new Error("createBudget not yet implemented");
}

/**
 * Update an existing budget.
 *
 * TODO: Implement budget update with delta calculation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Get old budget from Dexie
 * 3. Update budget in Dexie
 * 4. Get updated budget from Dexie
 * 5. Calculate delta with eventGenerator.calculateDelta()
 * 6. Generate event with createBudgetEvent('update', ...)
 * 7. Return updated budget
 *
 * @param id Budget ID
 * @param changes Partial budget data (only changed fields)
 * @returns Promise resolving to updated budget
 * @throws Error if not authenticated or budget not found
 *
 * @example
 * const updated = await updateBudget('bud-123', {
 *   amount_cents: 75000,
 * });
 */
export async function updateBudget(
  _id: string,
  _changes: Partial<LocalBudget>
): Promise<LocalBudget> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // const oldBudget = await db.budgets.get(id);
  // if (!oldBudget) throw new Error("Budget not found");
  //
  // await db.budgets.update(id, {
  //   ...changes,
  //   updated_at: new Date().toISOString(),
  // });
  //
  // const newBudget = await db.budgets.get(id);
  // if (!newBudget) throw new Error("Budget not found after update");
  //
  // const delta = eventGenerator.calculateDelta(oldBudget, newBudget);
  //
  // // Generate event
  // await createBudgetEvent("update", id, delta, userId);
  //
  // return newBudget;

  throw new Error("updateBudget not yet implemented");
}

/**
 * Delete a budget.
 *
 * TODO: Implement budget deletion with event generation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Delete budget from Dexie
 * 3. Generate event with createBudgetEvent('delete', ...)
 *
 * Note: Budgets can be hard-deleted since they are reference targets only.
 *
 * @param id Budget ID
 * @returns Promise that resolves when deletion completes
 * @throws Error if not authenticated
 *
 * @example
 * await deleteBudget('bud-123');
 */
export async function deleteBudget(_id: string): Promise<void> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // await db.budgets.delete(id);
  //
  // // Generate event
  // await createBudgetEvent("delete", id, { deleted: true }, userId);

  throw new Error("deleteBudget not yet implemented");
}
