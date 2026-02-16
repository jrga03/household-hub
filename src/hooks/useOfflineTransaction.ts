/**
 * React Mutation Hooks for Offline Transaction Operations
 *
 * Provides TanStack Query mutation hooks for creating, updating, and deleting
 * transactions offline. These hooks handle:
 * - IndexedDB write operations
 * - Optimistic updates for instant UI feedback
 * - Automatic rollback on error
 * - Toast notifications for user feedback
 * - Error handling with graceful degradation
 *
 * Pattern: Optimistic updates with TanStack Query's onMutate/onError callbacks.
 * UI updates immediately before mutation completes, then rolls back on error.
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
import type { LocalTransaction } from "@/lib/dexie/db";

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
    // Optimistic update: Add transaction to cache immediately
    onMutate: async (newTransaction) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["transactions", "offline"] });

      // Snapshot the previous value for rollback
      const previousTransactions = queryClient.getQueryData(["transactions", "offline"]);

      // Optimistically update the cache with a temporary transaction
      queryClient.setQueryData(
        ["transactions", "offline"],
        (old: LocalTransaction[] | undefined) => {
          const optimisticTransaction = {
            ...newTransaction,
            id: `temp-${Date.now()}`, // Temporary ID until sync completes
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            synced: false,
          };
          return old ? [...old, optimisticTransaction] : [optimisticTransaction];
        }
      );

      // Return context for rollback
      return { previousTransactions };
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Transaction created and queued for sync");
      } else {
        toast.error(result.error || "Failed to create transaction");
      }
    },
    onError: (error, _newTransaction, context) => {
      // Rollback to previous state on error
      if (context?.previousTransactions) {
        queryClient.setQueryData(["transactions", "offline"], context.previousTransactions);
      }
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
    // Always refetch after error or success to ensure consistency
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
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
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<TransactionInput> }) => {
      if (!user?.id) throw new Error("User not authenticated");
      return updateOfflineTransaction(id, updates, user.id);
    },
    // Optimistic update: Update transaction in cache immediately
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", "offline"] });

      const previousTransactions = queryClient.getQueryData(["transactions", "offline"]);

      // Optimistically update the specific transaction
      queryClient.setQueryData(
        ["transactions", "offline"],
        (old: LocalTransaction[] | undefined) => {
          if (!old) return old;
          return old.map((txn) =>
            txn.id === id
              ? {
                  ...txn,
                  ...updates,
                  updated_at: new Date().toISOString(),
                  synced: false,
                }
              : txn
          );
        }
      );

      return { previousTransactions };
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Transaction updated and queued for sync");
      } else {
        toast.error(result.error || "Failed to update transaction");
      }
    },
    onError: (error, _variables, context) => {
      if (context?.previousTransactions) {
        queryClient.setQueryData(["transactions", "offline"], context.previousTransactions);
      }
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
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
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: (id: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      return deleteOfflineTransaction(id, user.id);
    },
    // Optimistic update: Remove transaction from cache immediately
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", "offline"] });

      const previousTransactions = queryClient.getQueryData(["transactions", "offline"]);

      // Optimistically remove the transaction
      queryClient.setQueryData(
        ["transactions", "offline"],
        (old: LocalTransaction[] | undefined) => {
          if (!old) return old;
          return old.filter((txn) => txn.id !== id);
        }
      );

      return { previousTransactions };
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Transaction deleted and queued for sync");
      } else {
        toast.error(result.error || "Failed to delete transaction");
      }
    },
    onError: (error, _id, context) => {
      if (context?.previousTransactions) {
        queryClient.setQueryData(["transactions", "offline"], context.previousTransactions);
      }
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
    },
  });
}
