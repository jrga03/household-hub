import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { readCategoryList } from "./projection";
import { FOOD, GROCERIES, categoryOnlyEvent, groupEvent } from "./projection.fixtures";

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("retiring", () => {
  const food = groupEvent("e-food", FOOD, "category_group.created", 1000, { name: "Food" });
  const groceries = categoryOnlyEvent("e-groceries", "category.created", 2000, {
    name: "Groceries",
    groupId: FOOD,
  });
  const retired = categoryOnlyEvent("e-retired", "category.retired", 3000);
  const unretired = categoryOnlyEvent("e-unretired", "category.unretired", 4000);
  const retiredAgain = categoryOnlyEvent("e-retired-2", "category.retired", 5000);
  const renamed = categoryOnlyEvent("e-renamed", "category.renamed", 6000, { name: "Market" });

  it.each(orders([food, groceries, retired, unretired, retiredAgain, renamed]))(
    "keeps the latest retirement and the latest name in the order %j",
    async (_ids, order) => {
      for (const event of order) await receiveEvents([event], 0);

      const list = await readCategoryList();
      expect(list.groups).toMatchObject([{ id: FOOD, categories: [] }]);
      expect(list.retiredCategories).toMatchObject([
        { id: GROCERIES, name: "Market", retired: true, group: { id: FOOD } },
      ]);
    }
  );

  it("lists a retired group under Retired", async () => {
    await receiveEvents(
      [food, groupEvent("e-food-retired", FOOD, "category_group.retired", 2000)],
      0
    );

    const list = await readCategoryList();
    expect(list.groups).toEqual([]);
    expect(list.retiredGroups).toMatchObject([{ id: FOOD, name: "Food", retired: true }]);
  });

  it("keeps a retired group listed while it still holds a category in use", async () => {
    // Another device added Groceries before it saw Food retired.
    const foodRetired = groupEvent("e-food-retired", FOOD, "category_group.retired", 3000);
    await receiveEvents([food, groceries, foodRetired], 0);

    const list = await readCategoryList();
    expect(list.groups).toMatchObject([
      { id: FOOD, retired: true, categories: [{ id: GROCERIES }] },
    ]);
    expect(list.retiredGroups).toEqual([]);
  });
});
