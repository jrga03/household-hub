/**
 * Category CRUD Operations
 *
 * Placeholder file for category create/update/delete operations.
 * Will be implemented in future chunks with full event generation hooks.
 *
 * Implementation pattern:
 * 1. Get userId from authStore
 * 2. Perform mutation in Dexie
 * 3. For updates: Calculate delta with eventGenerator.calculateDelta()
 * 4. Call createCategoryEvent() to generate event
 * 5. Return result
 *
 * @module lib/categories
 */

// import { nanoid } from "nanoid";
// import { db } from "./dexie/db";
// import { createCategoryEvent, eventGenerator } from "./event-generator";
// import { useAuthStore } from "@/stores/authStore";
import type { LocalCategory } from "./dexie/db";

/**
 * Category input data (subset of LocalCategory).
 */
export interface CategoryInput {
  household_id: string;
  parent_id?: string; // null for parent categories
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

/**
 * Create a new category.
 *
 * TODO: Implement category creation with event generation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Create category in Dexie
 * 3. Generate event with createCategoryEvent('create', ...)
 * 4. Return created category
 *
 * @param data Category input data
 * @returns Promise resolving to created category
 * @throws Error if not authenticated
 *
 * @example
 * const category = await createCategory({
 *   household_id: '...',
 *   parent_id: null,
 *   name: 'Groceries',
 *   color: '#FF5722',
 *   icon: 'shopping-cart',
 *   sort_order: 0,
 *   is_active: true,
 * });
 */
export async function createCategory(_data: CategoryInput): Promise<LocalCategory> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // const category: LocalCategory = {
  //   ...data,
  //   id: nanoid(),
  //   created_at: new Date().toISOString(),
  //   updated_at: new Date().toISOString(),
  // };
  //
  // await db.categories.add(category);
  //
  // // Generate event
  // await createCategoryEvent("create", category.id, category, userId);
  //
  // return category;

  throw new Error("createCategory not yet implemented");
}

/**
 * Update an existing category.
 *
 * TODO: Implement category update with delta calculation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Get old category from Dexie
 * 3. Update category in Dexie
 * 4. Get updated category from Dexie
 * 5. Calculate delta with eventGenerator.calculateDelta()
 * 6. Generate event with createCategoryEvent('update', ...)
 * 7. Return updated category
 *
 * @param id Category ID
 * @param changes Partial category data (only changed fields)
 * @returns Promise resolving to updated category
 * @throws Error if not authenticated or category not found
 *
 * @example
 * const updated = await updateCategory('cat-123', {
 *   name: 'Updated Category Name',
 *   is_active: false,
 * });
 */
export async function updateCategory(
  _id: string,
  _changes: Partial<LocalCategory>
): Promise<LocalCategory> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // const oldCategory = await db.categories.get(id);
  // if (!oldCategory) throw new Error("Category not found");
  //
  // await db.categories.update(id, {
  //   ...changes,
  //   updated_at: new Date().toISOString(),
  // });
  //
  // const newCategory = await db.categories.get(id);
  // if (!newCategory) throw new Error("Category not found after update");
  //
  // const delta = eventGenerator.calculateDelta(oldCategory, newCategory);
  //
  // // Generate event
  // await createCategoryEvent("update", id, delta, userId);
  //
  // return newCategory;

  throw new Error("updateCategory not yet implemented");
}

/**
 * Delete a category (soft delete by setting is_active: false).
 *
 * TODO: Implement category deletion with event generation.
 *
 * Flow:
 * 1. Get current user from authStore
 * 2. Update category in Dexie (set is_active: false)
 * 3. Generate event with createCategoryEvent('delete', ...)
 *
 * Note: Categories should not be hard-deleted due to transaction references.
 * Use soft delete (is_active: false) instead.
 *
 * @param id Category ID
 * @returns Promise that resolves when deletion completes
 * @throws Error if not authenticated
 *
 * @example
 * await deleteCategory('cat-123');
 */
export async function deleteCategory(_id: string): Promise<void> {
  // TODO: Implement in future chunk
  // const userId = useAuthStore.getState().user?.id;
  // if (!userId) throw new Error("Not authenticated");
  //
  // // Soft delete: Set is_active to false
  // await db.categories.update(id, {
  //   is_active: false,
  //   updated_at: new Date().toISOString(),
  // });
  //
  // // Generate event
  // await createCategoryEvent("delete", id, { is_active: false }, userId);

  throw new Error("deleteCategory not yet implemented");
}
