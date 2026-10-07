import type { QueryClient } from "@tanstack/react-query";
import { invalidateAfterWrite } from "@/lib/query-keys";
import { syncProcessor } from "@/lib/sync/processor";
import type { EntityType } from "@/types/sync";

/**
 * Outbox writes land locally first; drain right away when online so the change
 * reaches the server (and server-backed lists) without waiting for the next
 * sync trigger. Offline, processQueue would burn a retry slot per item.
 */
export function afterOutboxWrite(
  queryClient: QueryClient,
  userId: string | undefined,
  entities: EntityType | readonly EntityType[]
): void {
  invalidateAfterWrite(queryClient, entities);

  if (userId && navigator.onLine) {
    syncProcessor
      .processQueue(userId)
      .then(() => invalidateAfterWrite(queryClient, entities))
      .catch(() => {});
  }
}
