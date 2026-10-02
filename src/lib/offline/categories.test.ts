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
    expect(queue[0]!.operation.op).toBe("create");
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

  describe("duplicate names", () => {
    it("rejects a create whose name matches an active sibling, ignoring case", async () => {
      await createOfflineCategory({ name: "Food" }, userId);
      await db.syncQueue.clear();

      const result = await createOfflineCategory({ name: "FOOD", parent_id: null }, userId);

      expect(result).toMatchObject({
        success: false,
        error: 'A category named "FOOD" already exists',
      });
      expect(await db.categories.count()).toBe(1);
      expect(await db.syncQueue.count()).toBe(0);
    });

    it("allows the same name under a different parent", async () => {
      const food = await createOfflineCategory({ name: "Food" }, userId);
      const bills = await createOfflineCategory({ name: "Bills" }, userId);
      await createOfflineCategory({ name: "Other", parent_id: food.data!.id }, userId);

      const result = await createOfflineCategory(
        { name: "Other", parent_id: bills.data!.id },
        userId
      );

      expect(result.success).toBe(true);
    });

    it("rejects renaming onto an active sibling's name", async () => {
      await createOfflineCategory({ name: "Food" }, userId);
      const other = await createOfflineCategory({ name: "Transport" }, userId);
      await db.syncQueue.clear();

      const result = await updateOfflineCategory(other.data!.id, { name: "food" }, userId);

      expect(result).toMatchObject({
        success: false,
        error: 'A category named "food" already exists',
      });
      expect(await db.syncQueue.count()).toBe(0);
    });

    it("rejects reusing the name of an archived child category under the same parent", async () => {
      const food = await createOfflineCategory({ name: "Food" }, userId);
      const old = await createOfflineCategory({ name: "Snacks", parent_id: food.data!.id }, userId);
      await deactivateOfflineCategory(old.data!.id, userId);
      await db.syncQueue.clear();

      const result = await createOfflineCategory(
        { name: "snacks", parent_id: food.data!.id },
        userId
      );

      expect(result).toMatchObject({
        success: false,
        error: 'An archived category named "snacks" already exists. Choose another name.',
      });
      expect(await db.syncQueue.count()).toBe(0);
    });

    it("rejects moving a category onto an archived sibling's name", async () => {
      const food = await createOfflineCategory({ name: "Food" }, userId);
      const old = await createOfflineCategory({ name: "Snacks", parent_id: food.data!.id }, userId);
      await deactivateOfflineCategory(old.data!.id, userId);
      const loose = await createOfflineCategory({ name: "Snacks" }, userId);

      const result = await updateOfflineCategory(
        loose.data!.id,
        { parent_id: food.data!.id },
        userId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("archived category");
    });

    it("allows a top-level category to reuse an archived top-level name", async () => {
      const old = await createOfflineCategory({ name: "Misc" }, userId);
      await deactivateOfflineCategory(old.data!.id, userId);

      const result = await createOfflineCategory({ name: "Misc" }, userId);

      expect(result.success).toBe(true);
    });
  });
});
