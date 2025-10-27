/**
 * React Mutation Hooks for Offline Category Operations
 *
 * Provides TanStack Query mutation hooks for creating, updating, and deactivating
 * categories offline. These hooks handle:
 * - IndexedDB write operations
 * - Cache invalidation for UI updates
 * - Toast notifications for user feedback
 * - Error handling with graceful degradation
 *
 * Pattern: Simple cache invalidation approach.
 * UI refetches from IndexedDB after mutation completes.
 *
 * Note: Categories are household-scoped (no userId parameter).
 *
 * @see instructions.md Step 5 (lines 641-713)
 * @module hooks/useOfflineCategory
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createOfflineCategory,
  updateOfflineCategory,
  deactivateOfflineCategory,
} from "@/lib/offline/categories";
import type { CategoryInput } from "@/lib/offline/types";

/**
 * Hook for creating categories offline
 *
 * Creates a new category in IndexedDB with a temporary ID.
 * The category will be synced to Supabase when online (chunk 024).
 *
 * Supports two-level hierarchy via parent_id field.
 *
 * @example Parent category
 * const createCategory = useCreateOfflineCategory();
 *
 * await createCategory.mutateAsync({
 *   name: "Food & Dining",
 *   sort_order: 1,
 *   is_active: true
 * });
 *
 * @example Child category
 * await createCategory.mutateAsync({
 *   name: "Groceries",
 *   parent_id: parentCategoryId,
 *   color: "#10B981",
 *   icon: "shopping-cart",
 *   sort_order: 1,
 *   is_active: true
 * });
 */
export function useCreateOfflineCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CategoryInput) => {
      return createOfflineCategory(input);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["categories", "offline"] });
        toast.success("Category created (offline)");
      } else {
        toast.error(result.error || "Failed to create category");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

/**
 * Hook for updating categories offline
 *
 * Updates an existing category in IndexedDB.
 * Works with both temporary IDs (offline-created) and server IDs (synced).
 *
 * Can update parent_id to move category in hierarchy.
 *
 * @example
 * const updateCategory = useUpdateOfflineCategory();
 *
 * await updateCategory.mutateAsync({
 *   id: "temp-abc123",
 *   updates: {
 *     name: "Updated Category Name",
 *     color: "#8B5CF6",
 *     icon: "briefcase"
 *   }
 * });
 */
export function useUpdateOfflineCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CategoryInput> }) => {
      return updateOfflineCategory(id, updates);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["categories", "offline"] });
        toast.success("Category updated (offline)");
      } else {
        toast.error(result.error || "Failed to update category");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

/**
 * Hook for deactivating categories offline
 *
 * Soft-deletes a category by setting is_active to false.
 * Category remains in database for historical transaction integrity.
 *
 * Note: Deactivating a parent category does NOT deactivate children.
 * UI should handle this logic if desired (show warning, batch deactivate, etc.).
 *
 * @example
 * const deactivateCategory = useDeactivateOfflineCategory();
 *
 * await deactivateCategory.mutateAsync("temp-abc123");
 */
export function useDeactivateOfflineCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateOfflineCategory(id),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["categories", "offline"] });
        toast.success("Category deactivated (offline)");
      } else {
        toast.error(result.error || "Failed to deactivate category");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}
