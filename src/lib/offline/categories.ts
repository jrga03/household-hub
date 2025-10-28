/**
 * Offline Category Mutations for Household Hub
 *
 * Implements offline-first category CRUD operations using IndexedDB via Dexie.
 * These functions enable users to create, update, and deactivate categories while offline.
 * Changes are stored locally and will sync to Supabase when connectivity is restored.
 *
 * Key Patterns:
 * - Temporary IDs: Use `temp-${nanoid()}` format for offline-created entities
 * - Household-scoped: Categories are always household-level (no owner_user_id)
 * - Two-level hierarchy: Support parent/child categories via parent_id field
 * - Graceful Errors: Return structured results, never throw exceptions
 * - Household MVP: Hardcoded household_id for single-household mode
 *
 * See instructions.md Step 4 (lines 377-478) for implementation details.
 *
 * @module offline/categories
 */

import { nanoid } from "nanoid";
import { db, type LocalCategory } from "@/lib/dexie/db";
import { addToSyncQueue } from "./syncQueue";
import type { CategoryInput, OfflineOperationResult } from "./types";

/**
 * Default household ID for MVP (single household mode).
 * See DECISIONS.md #61 for multi-household architecture deferral.
 */
const DEFAULT_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Default category color (gray) if not provided.
 */
const DEFAULT_COLOR = "#6B7280";

/**
 * Default category icon if not provided.
 */
const DEFAULT_ICON = "folder";

/**
 * Creates a new category offline with temporary ID.
 *
 * The category is immediately written to IndexedDB and will be synced to
 * Supabase when connectivity is restored. The temporary ID will be replaced
 * with a permanent UUID during sync.
 *
 * Field Generation:
 * - id: `temp-${nanoid()}` - Temporary identifier replaced during sync
 * - household_id: Hardcoded for MVP single household mode
 * - parent_id: Optional for two-level hierarchy (undefined for parent categories)
 * - color: Defaults to gray (#6B7280) if not provided
 * - icon: Defaults to "folder" if not provided
 * - sort_order: Required field from input
 * - is_active: Required field from input
 * - created_at/updated_at: Current ISO timestamp
 *
 * Two-Level Hierarchy:
 * - If parent_id is undefined/null: Creates a parent category
 * - If parent_id is provided: Creates a child category under the parent
 * - Hierarchy validation happens during sync, not offline
 *
 * Error Handling:
 * - IndexedDB quota exceeded: Returns error with quota message
 * - All errors logged to console but don't throw
 *
 * @param input - Category data from form (excluding generated fields)
 * @param userId - User ID for sync queue attribution
 * @returns Promise resolving to result with success status and data/error
 *
 * @example
 * // Create parent category
 * const result = await createOfflineCategory({
 *   name: "Food & Dining",
 *   color: "#10B981",
 *   icon: "utensils",
 *   sort_order: 0,
 *   is_active: true,
 * }, "user-123");
 *
 * @example
 * // Create child category
 * const result = await createOfflineCategory({
 *   name: "Groceries",
 *   parent_id: "cat-123",
 *   color: "#10B981",
 *   icon: "shopping-cart",
 *   sort_order: 0,
 *   is_active: true,
 * }, "user-123");
 *
 * if (result.success) {
 *   console.log("Category created:", result.data.id);
 * }
 */
export async function createOfflineCategory(
  input: CategoryInput,
  userId: string
): Promise<OfflineOperationResult<LocalCategory>> {
  try {
    // Generate temporary ID (will be replaced with UUID during sync)
    const tempId = `temp-${nanoid()}`;
    const now = new Date().toISOString();

    // Map CategoryInput → LocalCategory by adding generated fields
    const category: LocalCategory = {
      id: tempId,
      household_id: DEFAULT_HOUSEHOLD_ID,
      name: input.name,
      parent_id: input.parent_id ?? undefined, // Convert null to undefined for consistency
      color: input.color || DEFAULT_COLOR,
      icon: input.icon || DEFAULT_ICON,
      sort_order: input.sort_order,
      is_active: input.is_active,
      created_at: now,
      updated_at: now,
    };

    // Step 1: Write to IndexedDB
    await db.categories.add(category);

    // Step 2: Add to sync queue
    const queueResult = await addToSyncQueue(
      "category",
      category.id,
      "create",
      category as unknown as Record<string, unknown>,
      userId
    );

    // Step 3: Rollback IndexedDB if queue fails
    if (!queueResult.success) {
      await db.categories.delete(category.id);
      return {
        success: false,
        error: `Failed to queue for sync: ${queueResult.error}`,
        isTemporary: false,
      };
    }

    return {
      success: true,
      data: category,
      isTemporary: true, // Using temp ID
    };
  } catch (error) {
    console.error("Failed to create offline category:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create category offline",
      isTemporary: false,
    };
  }
}

/**
 * Updates an existing category offline.
 *
 * Fetches the current category from IndexedDB, applies the updates, and writes
 * the modified category back. The updated_at timestamp is automatically refreshed.
 *
 * Field Updates:
 * - Only fields present in `updates` are modified
 * - updated_at is always refreshed to current timestamp
 * - parent_id can be changed to move category in hierarchy
 * - All other fields remain unchanged
 *
 * Validation:
 * - Category must exist in IndexedDB
 * - Returns error if category not found
 * - Hierarchy validation happens during sync, not offline
 *
 * Error Handling:
 * - Category not found: Returns error with "not found" message
 * - IndexedDB errors: Returns error with details
 * - All errors logged to console but don't throw
 *
 * @param id - Category ID (can be temporary or permanent)
 * @param updates - Partial category data to update
 * @param userId - User ID for sync queue attribution
 * @returns Promise resolving to result with success status and data/error
 *
 * @example
 * const result = await updateOfflineCategory("temp-abc123", {
 *   name: "Food & Drink (Updated)",
 *   color: "#059669",
 * }, "user-123");
 *
 * if (result.success) {
 *   console.log("Category updated:", result.data.name);
 * }
 *
 * @example
 * // Move category to different parent
 * const result = await updateOfflineCategory("cat-123", {
 *   parent_id: "cat-456", // New parent
 * }, "user-123");
 */
export async function updateOfflineCategory(
  id: string,
  updates: Partial<CategoryInput>,
  userId: string
): Promise<OfflineOperationResult<LocalCategory>> {
  try {
    // Fetch existing category from IndexedDB
    const existing = await db.categories.get(id);

    if (!existing) {
      return {
        success: false,
        error: `Category with ID "${id}" not found`,
        isTemporary: false,
      };
    }

    // Apply updates to existing category
    const updated: LocalCategory = {
      ...existing,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.parent_id !== undefined && { parent_id: updates.parent_id ?? undefined }),
      ...(updates.color !== undefined && { color: updates.color }),
      ...(updates.icon !== undefined && { icon: updates.icon }),
      ...(updates.sort_order !== undefined && { sort_order: updates.sort_order }),
      ...(updates.is_active !== undefined && { is_active: updates.is_active }),
      updated_at: new Date().toISOString(),
    };

    // Step 1: Write updated category back to IndexedDB
    await db.categories.put(updated);

    // Step 2: Add to sync queue
    const queueResult = await addToSyncQueue(
      "category",
      id,
      "update",
      updated as unknown as Record<string, unknown>,
      userId
    );

    // Step 3: Rollback IndexedDB if queue fails
    if (!queueResult.success) {
      await db.categories.put(existing);
      return {
        success: false,
        error: `Failed to queue for sync: ${queueResult.error}`,
        isTemporary: false,
      };
    }

    return {
      success: true,
      data: updated,
      isTemporary: id.startsWith("temp-"),
    };
  } catch (error) {
    console.error("Failed to update offline category:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update category offline",
      isTemporary: false,
    };
  }
}

/**
 * Deactivates a category offline (soft delete).
 *
 * This is a convenience wrapper around updateOfflineCategory that sets
 * is_active to false. Deactivated categories are hidden from the UI but
 * remain in the database for historical transaction integrity.
 *
 * Implementation Note:
 * - Calls updateOfflineCategory with `{ is_active: false }`
 * - Inherits all error handling from updateOfflineCategory
 * - Returns same result structure as updateOfflineCategory
 *
 * Design Rationale:
 * - Soft delete preserves historical data integrity
 * - Prevents orphaned transactions with invalid category_id
 * - Supports category reactivation if needed
 * - Child categories are not automatically deactivated (handled by UI logic)
 *
 * @param id - Category ID to deactivate
 * @param userId - User ID for sync queue attribution
 * @returns Promise resolving to result with success status and data/error
 *
 * @example
 * const result = await deactivateOfflineCategory("temp-abc123", "user-123");
 *
 * if (result.success) {
 *   console.log("Category deactivated:", result.data.name);
 * }
 */
export async function deactivateOfflineCategory(
  id: string,
  userId: string
): Promise<OfflineOperationResult<LocalCategory>> {
  return updateOfflineCategory(id, { is_active: false }, userId);
}
