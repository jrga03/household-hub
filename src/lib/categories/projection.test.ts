import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { readCategoryList } from "./projection";
import { BILLS, FOOD, GROCERIES, categoryOnlyEvent, groupEvent } from "./projection.fixtures";

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("category and group projection", () => {
  const food = groupEvent("e-food", FOOD, "category_group.created", 1000, { name: "Food" });
  const bills = groupEvent("e-bills", BILLS, "category_group.created", 2000, { name: "Bills" });
  const groceries = categoryOnlyEvent("e-groceries", "category.created", 3000, {
    name: "Groceries",
    groupId: FOOD,
  });
  // One device renames, another moves: both survive.
  const renamed = categoryOnlyEvent("e-renamed", "category.renamed", 4000, { name: "Market" });
  const moved = categoryOnlyEvent("e-moved", "category.moved", 5000, { groupId: BILLS });

  it.each(orders([food, bills, groceries, renamed, moved]))(
    "builds the same list from events in the order %j",
    async (_ids, order) => {
      for (const event of order) await receiveEvents([event], 0);

      const list = await readCategoryList();
      expect(list.groups).toMatchObject([
        {
          id: BILLS,
          name: "Bills",
          categories: [{ id: GROCERIES, name: "Market", groupId: BILLS }],
        },
        { id: FOOD, name: "Food", categories: [] },
      ]);
      expect(list.ungrouped).toEqual([]);
    }
  );

  it("ignores a duplicate event", async () => {
    await receiveEvents([food, groceries, renamed], 0);
    await receiveEvents([renamed, groceries, groceries], 0);

    const list = await readCategoryList();
    expect(list.groups).toMatchObject([{ id: FOOD, categories: [{ name: "Market" }] }]);
  });

  it("skips a create whose payload isn't a category", async () => {
    const broken = categoryOnlyEvent("e-broken", "category.created", 3000, { name: "  " });
    await receiveEvents([food, broken], 0);

    expect((await readCategoryList()).groups).toMatchObject([{ id: FOOD, categories: [] }]);
  });
});
