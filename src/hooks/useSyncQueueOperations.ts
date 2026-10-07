/**
 * React Hooks for Sync Queue Operations
 *
 * Provides TanStack Query mutation hooks for manual sync queue management.
 * These hooks handle retry, discard, and batch operations with user feedback (the queue screens read Dexie through useLiveQuery and update themselves).
 *
 * @module hooks/useSyncQueueOperations
 */

import { useMutation } from "@tanstack/react-query";
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
 *
 * @example
 * const retryMutation = useRetrySyncItem();
 *
 * <Button onClick={() => retryMutation.mutate(itemId)}>
 *   Retry
 * </Button>
 */
export function useRetrySyncItem() {
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      return retrySyncQueueItem(itemId, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
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
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");
      return retryAllFailedItems(user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
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
 * const handleDiscard = async () => {
 *   // App-level AlertDialog, not window.confirm (review R39)
 *   const confirmed = await confirm({
 *     title: "Discard this change?",
 *     description: "This action cannot be undone.",
 *     confirmLabel: "Discard",
 *     destructive: true,
 *   });
 *   if (confirmed) discardMutation.mutate(itemId);
 * };
 */
export function useDiscardSyncItem() {
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) throw new Error("User not authenticated");
      return discardSyncQueueItem(itemId, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
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
