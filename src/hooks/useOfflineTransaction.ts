/**
 * React Mutation Hooks for Offline Transaction Operations
 *
 * Provides TanStack Query mutation hooks for creating, updating, and deleting
 * transactions offline. These hooks handle:
 * - IndexedDB write operations
 * - Cache invalidation for UI updates
 * - Toast notifications for user feedback
 * - Error handling with graceful degradation
 *
 * Pattern: Simple cache invalidation approach (not true optimistic updates).
 * UI refetches from IndexedDB after mutation completes, providing near-instant
 * feedback without the complexity of optimistic update rollbacks.
 *
 * @see instructions.md Step 5 (lines 484-562)
 * @module hooks/useOfflineTransaction
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import {
  createOfflineTransaction,
  updateOfflineTransaction,
  deleteOfflineTransaction,
} from "@/lib/offline/transactions";
import type { TransactionInput } from "@/lib/offline/types";

/**
 * Hook for creating transactions offline
 *
 * Creates a new transaction in IndexedDB with a temporary ID.
 * The transaction will be synced to Supabase when online (chunk 024).
 *
 * @example
 * const createTransaction = useCreateOfflineTransaction();
 *
 * await createTransaction.mutateAsync({
 *   date: "2024-01-15",
 *   description: "Groceries",
 *   amount_cents: 150050,
 *   type: "expense",
 *   account_id: accountId,
 *   category_id: categoryId,
 *   status: "cleared",
 *   visibility: "household"
 * });
 */
export function useCreateOfflineTransaction() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: (input: TransactionInput) => {
      if (!user?.id) throw new Error("User not authenticated");
      return createOfflineTransaction(input, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate transactions query to refetch from IndexedDB
        queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
        toast.success("Transaction created (offline)");
      } else {
        toast.error(result.error || "Failed to create transaction");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

/**
 * Hook for updating transactions offline
 *
 * Updates an existing transaction in IndexedDB.
 * Works with both temporary IDs (offline-created) and server IDs (synced).
 *
 * @example
 * const updateTransaction = useUpdateOfflineTransaction();
 *
 * await updateTransaction.mutateAsync({
 *   id: "temp-abc123",
 *   updates: {
 *     description: "Updated description",
 *     amount_cents: 200000
 *   }
 * });
 */
export function useUpdateOfflineTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<TransactionInput> }) => {
      return updateOfflineTransaction(id, updates);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
        toast.success("Transaction updated (offline)");
      } else {
        toast.error(result.error || "Failed to update transaction");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

/**
 * Hook for deleting transactions offline
 *
 * Removes a transaction from IndexedDB.
 * For synced transactions, this creates a delete event in the sync queue (chunk 023).
 * For temporary transactions, this just removes them locally.
 *
 * @example
 * const deleteTransaction = useDeleteOfflineTransaction();
 *
 * await deleteTransaction.mutateAsync("temp-abc123");
 */
export function useDeleteOfflineTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteOfflineTransaction(id),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
        toast.success("Transaction deleted (offline)");
      } else {
        toast.error(result.error || "Failed to delete transaction");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}
