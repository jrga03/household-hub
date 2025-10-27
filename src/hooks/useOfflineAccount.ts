/**
 * React Mutation Hooks for Offline Account Operations
 *
 * Provides TanStack Query mutation hooks for creating, updating, and deactivating
 * accounts offline. These hooks handle:
 * - IndexedDB write operations
 * - Cache invalidation for UI updates
 * - Toast notifications for user feedback
 * - Error handling with graceful degradation
 *
 * Pattern: Simple cache invalidation approach.
 * UI refetches from IndexedDB after mutation completes.
 *
 * @see instructions.md Step 5 (lines 564-639)
 * @module hooks/useOfflineAccount
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import {
  createOfflineAccount,
  updateOfflineAccount,
  deactivateOfflineAccount,
} from "@/lib/offline/accounts";
import type { AccountInput } from "@/lib/offline/types";

/**
 * Hook for creating accounts offline
 *
 * Creates a new account in IndexedDB with a temporary ID.
 * The account will be synced to Supabase when online (chunk 024).
 *
 * @example
 * const createAccount = useCreateOfflineAccount();
 *
 * await createAccount.mutateAsync({
 *   name: "Checking Account",
 *   type: "bank",
 *   visibility: "household",
 *   initial_balance_cents: 500000,
 *   is_active: true
 * });
 */
export function useCreateOfflineAccount() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: (input: AccountInput) => {
      if (!user?.id) throw new Error("User not authenticated");
      return createOfflineAccount(input, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["accounts", "offline"] });
        toast.success("Account created (offline)");
      } else {
        toast.error(result.error || "Failed to create account");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

/**
 * Hook for updating accounts offline
 *
 * Updates an existing account in IndexedDB.
 * Works with both temporary IDs (offline-created) and server IDs (synced).
 *
 * @example
 * const updateAccount = useUpdateOfflineAccount();
 *
 * await updateAccount.mutateAsync({
 *   id: "temp-abc123",
 *   updates: {
 *     name: "Updated Account Name",
 *     color: "#10B981"
 *   }
 * });
 */
export function useUpdateOfflineAccount() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<AccountInput> }) => {
      if (!user?.id) throw new Error("User not authenticated");
      return updateOfflineAccount(id, updates, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["accounts", "offline"] });
        toast.success("Account updated (offline)");
      } else {
        toast.error(result.error || "Failed to update account");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

/**
 * Hook for deactivating accounts offline
 *
 * Soft-deletes an account by setting is_active to false.
 * Account remains in database for historical transaction integrity.
 *
 * @example
 * const deactivateAccount = useDeactivateOfflineAccount();
 *
 * await deactivateAccount.mutateAsync("temp-abc123");
 */
export function useDeactivateOfflineAccount() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: (id: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      return deactivateOfflineAccount(id, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["accounts", "offline"] });
        toast.success("Account deactivated (offline)");
      } else {
        toast.error(result.error || "Failed to deactivate account");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}
