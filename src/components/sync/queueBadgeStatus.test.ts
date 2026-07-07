import { describe, it, expect } from "vitest";
import { buildEntitySyncStatusMap } from "./queueBadgeStatus";
import type { SyncQueueItem } from "@/types/sync";

type QueueItemLike = Pick<SyncQueueItem, "entity_type" | "entity_id" | "status">;

function item(
  entity_id: string,
  status: SyncQueueItem["status"],
  entity_type: SyncQueueItem["entity_type"] = "transaction"
): QueueItemLike {
  return { entity_type, entity_id, status };
}

describe("buildEntitySyncStatusMap", () => {
  it("returns an empty map for no items", () => {
    expect(buildEntitySyncStatusMap([], "transaction").size).toBe(0);
  });

  it("maps queued items to pending", () => {
    const map = buildEntitySyncStatusMap([item("t1", "queued")], "transaction");
    expect(map.get("t1")).toBe("pending");
  });

  it("maps syncing items to pending", () => {
    const map = buildEntitySyncStatusMap([item("t1", "syncing")], "transaction");
    expect(map.get("t1")).toBe("pending");
  });

  it("maps failed items to failed (review R3)", () => {
    const map = buildEntitySyncStatusMap([item("t1", "failed")], "transaction");
    expect(map.get("t1")).toBe("failed");
  });

  it("failed wins over queued for the same entity, regardless of item order", () => {
    const failedFirst = buildEntitySyncStatusMap(
      [item("t1", "failed"), item("t1", "queued")],
      "transaction"
    );
    expect(failedFirst.get("t1")).toBe("failed");

    const queuedFirst = buildEntitySyncStatusMap(
      [item("t1", "queued"), item("t1", "failed")],
      "transaction"
    );
    expect(queuedFirst.get("t1")).toBe("failed");
  });

  it("ignores items of other entity types", () => {
    const map = buildEntitySyncStatusMap(
      [item("a1", "failed", "account"), item("t1", "queued")],
      "transaction"
    );
    expect(map.has("a1")).toBe(false);
    expect(map.get("t1")).toBe("pending");
  });

  it("tracks multiple entities independently", () => {
    const map = buildEntitySyncStatusMap(
      [item("t1", "queued"), item("t2", "failed"), item("t3", "syncing")],
      "transaction"
    );
    expect(map.get("t1")).toBe("pending");
    expect(map.get("t2")).toBe("failed");
    expect(map.get("t3")).toBe("pending");
    expect(map.has("t4")).toBe(false);
  });
});
