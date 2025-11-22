/**
 * React Hooks for Sync Queue Operations
 *
 * Provides TanStack Query mutation hooks for manual sync queue management.
 * These hooks handle retry, discard, and batch operations with proper
 * cache invalidation and user feedback.
 *
 * @module hooks/useSyncQueueOperations
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import {
  retrySyncQueueItem,
  discardSyncQueueItem,
  retryAllFailedItems,
} from "@/lib/offline/syncQueueOperations";

/**
 * Hook for retrying a single failed sync queue item
 *
 * Resets the item's status to "queued" and triggers sync processor.
 * Automatically invalidates sync queue queries to update UI.
 *
 * @example
 * const retryMutation = useRetrySyncItem();
 *
 * <Button onClick={() => retryMutation.mutate(itemId)}>
 *   Retry
 * </Button>
 */
export function useRetrySyncItem() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      return retrySyncQueueItem(itemId, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate sync queue queries
        queryClient.invalidateQueries({ queryKey: ["sync-queue", "pending"] });
        queryClient.invalidateQueries({ queryKey: ["offline", "sync", "queue", "count"] });
        toast.success("Retry initiated - syncing now...");
      } else {
        toast.error(result.error || "Failed to retry item");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to retry");
    },
  });
}

/**
 * Hook for retrying all failed sync queue items
 *
 * Batch operation that resets all failed items and triggers sync.
 * Shows count of items being retried.
 *
 * @example
 * const retryAllMutation = useRetryAllFailed();
 *
 * <Button onClick={() => retryAllMutation.mutate()}>
 *   Retry All Failed
 * </Button>
 */
export function useRetryAllFailed() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");
      return retryAllFailedItems(user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["sync-queue", "pending"] });
        queryClient.invalidateQueries({ queryKey: ["offline", "sync", "queue", "count"] });

        const count = result.count || 0;
        if (count > 0) {
          toast.success(`Retrying ${count} ${count === 1 ? "item" : "items"}...`);
        } else {
          toast.info("No failed items to retry");
        }
      } else {
        toast.error(result.error || "Failed to retry items");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to retry all");
    },
  });
}

/**
 * Hook for discarding a sync queue item
 *
 * Permanently deletes the item from sync queue. This cannot be undone.
 * Should only be called after user confirmation.
 *
 * @example
 * const discardMutation = useDiscardSyncItem();
 *
 * const handleDiscard = () => {
 *   if (confirm("Discard this change? Cannot be undone.")) {
 *     discardMutation.mutate(itemId);
 *   }
 * };
 */
export function useDiscardSyncItem() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      return discardSyncQueueItem(itemId, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["sync-queue", "pending"] });
        queryClient.invalidateQueries({ queryKey: ["offline", "sync", "queue", "count"] });
        toast.success("Item discarded");
      } else {
        toast.error(result.error || "Failed to discard item");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to discard");
    },
  });
}
