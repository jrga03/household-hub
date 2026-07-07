import type { SyncQueueItem } from "@/types/sync";
import type { SyncStatus } from "@/components/sync/SyncBadge";

/**
 * Per-entity badge status derived from outstanding outbox items.
 * Entities with no outstanding item are absent (render as "synced").
 */
export type EntityBadgeStatus = Extract<SyncStatus, "pending" | "failed">;

type QueueItemLike = Pick<SyncQueueItem, "entity_type" | "entity_id" | "status">;

/**
 * Maps outstanding outbox items (queued/syncing/failed) to a per-entity
 * SyncBadge status for the given entity type.
 *
 * "failed" wins over queued/syncing for the same entity so rows surface
 * terminal sync failures instead of an indefinite "pending" (review R3).
 * Callers should treat entities absent from the map as "synced".
 */
export function buildEntitySyncStatusMap(
  items: QueueItemLike[],
  entityType: SyncQueueItem["entity_type"]
): Map<string, EntityBadgeStatus> {
  const map = new Map<string, EntityBadgeStatus>();
  for (const item of items) {
    if (item.entity_type !== entityType) continue;
    if (item.status === "failed") {
      map.set(item.entity_id, "failed");
    } else if (!map.has(item.entity_id)) {
      map.set(item.entity_id, "pending");
    }
  }
  return map;
}
