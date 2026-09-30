import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { syncProcessor } from "@/lib/sync/processor";

/**
 * Outbox writes land locally first; drain right away when online so the change
 * reaches the server (and server-backed lists) without waiting for the next
 * sync trigger. Offline, processQueue would burn a retry slot per item.
 */
export function afterOutboxWrite(
  queryClient: QueryClient,
  userId: string | undefined,
  queryKeys: QueryKey[]
): void {
  const invalidateAll = () => {
    for (const queryKey of queryKeys) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  invalidateAll();

  if (userId && navigator.onLine) {
    syncProcessor
      .processQueue(userId)
      .then(invalidateAll)
      .catch(() => {});
  }
}
