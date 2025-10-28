/**
 * React Hook for Sync Processor
 *
 * Provides a TanStack Query mutation hook for triggering manual sync operations.
 * Handles success/error notifications and query cache invalidation after sync.
 *
 * Key Features:
 * - Manual sync trigger via mutation
 * - Toast notifications for user feedback
 * - Automatic query cache invalidation (refetches offline data)
 * - Loading/error state management
 *
 * Usage:
 * ```tsx
 * const syncMutation = useSyncProcessor();
 *
 * <Button onClick={() => syncMutation.mutate()}>
 *   Sync Now
 * </Button>
 * ```
 *
 * @module hooks/useSyncProcessor
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { syncProcessor } from "@/lib/sync/processor";
import { syncIssuesManager } from "@/lib/sync/SyncIssuesManager";

/**
 * React hook for manual sync processor operations
 *
 * Returns a TanStack Query mutation that can be used to trigger sync operations.
 * The hook automatically:
 * 1. Gets the current user from auth store
 * 2. Calls syncProcessor.processQueue()
 * 3. Shows toast notifications for success/failure
 * 4. Invalidates offline query cache to refetch updated data
 *
 * State Management:
 * - `isPending`: Sync in progress
 * - `isSuccess`: Sync completed successfully
 * - `isError`: Sync failed
 * - `data`: Sync result { synced: number, failed: number }
 *
 * @returns TanStack Query mutation object
 *
 * @example
 * // Basic usage - manual sync button
 * function SyncButton() {
 *   const syncMutation = useSyncProcessor();
 *
 *   return (
 *     <Button
 *       onClick={() => syncMutation.mutate()}
 *       disabled={syncMutation.isPending}
 *     >
 *       {syncMutation.isPending ? "Syncing..." : "Sync Now"}
 *     </Button>
 *   );
 * }
 *
 * @example
 * // With loading state and result display
 * function SyncStatus() {
 *   const syncMutation = useSyncProcessor();
 *
 *   return (
 *     <div>
 *       <Button onClick={() => syncMutation.mutate()}>
 *         Sync
 *       </Button>
 *
 *       {syncMutation.isPending && <Spinner />}
 *
 *       {syncMutation.isSuccess && syncMutation.data && (
 *         <p>Synced {syncMutation.data.synced} items</p>
 *       )}
 *
 *       {syncMutation.isError && (
 *         <p className="text-red-500">
 *           Sync failed: {syncMutation.error.message}
 *         </p>
 *       )}
 *     </div>
 *   );
 * }
 *
 * @example
 * // Trigger sync programmatically after offline operation
 * function CreateTransaction() {
 *   const createMutation = useCreateOfflineTransaction();
 *   const syncMutation = useSyncProcessor();
 *
 *   const handleSubmit = async (data) => {
 *     await createMutation.mutateAsync(data);
 *
 *     // Trigger sync after offline creation
 *     syncMutation.mutate();
 *   };
 * }
 */
export function useSyncProcessor() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    /**
     * Mutation function - processes sync queue
     *
     * Validates user authentication, then calls syncProcessor.processQueue().
     *
     * @throws Error if user not authenticated
     * @returns Sync result { synced: number, failed: number }
     */
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error("Not authenticated");
      }

      return syncProcessor.processQueue(user.id);
    },

    /**
     * Success handler - shows toast and invalidates queries
     *
     * Toasts:
     * - Success: "Synced N items" (if synced > 0)
     * - Error: "N items failed to sync" (if failed > 0)
     *
     * Query Invalidation:
     * - Invalidates all queries with key ["offline"]
     * - This triggers refetch of offline data from IndexedDB
     * - Updated data (with server IDs) will be displayed
     *
     * Sync Issues Integration:
     * - Logs conflicts if result.conflictsResolved exists (chunk 032)
     * - Currently a placeholder until conflict detection is implemented
     *
     * @param result - Sync result from processor
     */
    onSuccess: (result) => {
      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} items`);

        // Invalidate all offline queries to refetch updated data
        // This ensures UI shows server IDs instead of temp IDs
        queryClient.invalidateQueries({ queryKey: ["offline"] });
      }

      if (result.failed > 0) {
        toast.error(`${result.failed} items failed to sync`);
      }

      // TODO (Chunk 032): Log conflict resolutions when conflict detection is implemented
      // The sync processor currently doesn't return conflictsResolved in result
      // When chunk 032 adds conflict detection, uncomment this:
      //
      // if (result.conflictsResolved && result.conflictsResolved.length > 0) {
      //   for (const conflict of result.conflictsResolved) {
      //     syncIssuesManager.logConflictResolution(
      //       conflict.entityType,
      //       conflict.entityId,
      //       conflict.field,
      //       conflict.localValue,
      //       conflict.remoteValue,
      //       conflict.resolvedValue
      //     );
      //   }
      // }
    },

    /**
     * Error handler - shows error toast and logs sync failure
     *
     * Handles errors from:
     * - Authentication failures (user not logged in)
     * - Network errors (offline, timeout)
     * - Supabase errors (RLS, permissions)
     * - Unexpected errors (bugs, edge cases)
     *
     * Sync Issues Integration:
     * - Logs sync failure to SyncIssuesManager for user visibility
     * - Marked as retryable (user can manually retry via UI)
     *
     * @param error - Error thrown by mutationFn
     */
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : "Sync failed";
      toast.error(errorMessage);

      // Log sync failure to issues panel
      // User can see and retry from the sync issues panel
      syncIssuesManager.logSyncFailure(
        "transaction", // Generic entity type (actual type unknown at this level)
        "batch-sync", // Batch sync operation (multiple items)
        error instanceof Error ? error : new Error(errorMessage),
        true // Can retry via manual sync button
      );
    },
  });
}
