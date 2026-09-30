import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  createOfflineCategory,
  deactivateOfflineCategory,
  updateOfflineCategory,
} from "./categories";

const userId = "12345678-1234-5678-1234-567812345678";

describe("offline categories", () => {
  beforeEach(async () => {
    await db.categories.clear();
    await db.syncQueue.clear();
  });

  it("creates a category from the form's payload shape, queued as a create", async () => {
    const result = await createOfflineCategory(
      { name: "Groceries", parent_id: null, color: "#6B7280", icon: "folder", sort_order: 2 },
      userId
    );

    expect(result.success).toBe(true);
    expect(await db.categories.get(result.data!.id)).toMatchObject({
      name: "Groceries",
      sort_order: 2,
      is_active: true,
    });
    const queue = await db.syncQueue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ entity_type: "category", entity_id: result.data!.id });
    expect(queue[0].operation.op).toBe("create");
  });

  it("updates and deactivates, each queueing one update", async () => {
    const created = await createOfflineCategory({ name: "Food" }, userId);
    await db.syncQueue.clear();

    await updateOfflineCategory(created.data!.id, { name: "Food & Drink" }, userId);
    await deactivateOfflineCategory(created.data!.id, userId);

    expect(await db.categories.get(created.data!.id)).toMatchObject({
      name: "Food & Drink",
      is_active: false,
    });
    const ops = (await db.syncQueue.toArray()).map((item) => item.operation.op);
    expect(ops).toEqual(["update", "update"]);
  });
});
