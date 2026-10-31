import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { loggedEvent } from "@/test/events";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { readCategoryList } from "./projection";
import { FOOD, GROCERIES, groceriesEvent, groupEvent } from "./projection.fixtures";

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("retiring", () => {
  const food = groupEvent("e-food", FOOD, "category_group.created", 1000, { name: "Food" });
  const groceries = groceriesEvent("e-groceries", "category.created", 2000, {
    name: "Groceries",
    groupId: FOOD,
  });
  const retired = groceriesEvent("e-retired", "category.retired", 3000);
  const unretired = groceriesEvent("e-unretired", "category.unretired", 4000);
  const retiredAgain = groceriesEvent("e-retired-2", "category.retired", 5000);
  const renamed = groceriesEvent("e-renamed", "category.renamed", 6000, { name: "Market" });

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

describe("deleting", () => {
  const food = groupEvent("e-food", FOOD, "category_group.created", 1000, { name: "Food" });
  const groceries = groceriesEvent("e-groceries", "category.created", 2000, {
    name: "Groceries",
    groupId: FOOD,
  });
  const retired = groceriesEvent("e-retired", "category.retired", 3000);
  const deleted = groceriesEvent("e-deleted", "category.deleted", 4000);
  // Another device spent from Groceries before it saw the delete.
  const spent = loggedEvent({
    id: "e-spent",
    entityType: "transaction",
    entityId: "dddddddd-0000-4000-8000-000000000001",
    eventType: "transaction.created",
    millis: 3500,
    payload: {
      date: "2026-10-12",
      type: "expense",
      amountCents: 25000,
      accountId: "aaaaaaaa-0000-4000-8000-000000000001",
      categoryId: GROCERIES,
      description: "Lunch",
      notes: "",
      status: "cleared",
    },
  });

  const retiredNames = async () =>
    (await readCategoryList()).retiredCategories.map((category) => category.name);

  it("hides a deleted category from every list", async () => {
    await receiveEvents([food, groceries, retired, deleted], 0);

    const list = await readCategoryList();
    expect(list.groups).toMatchObject([{ id: FOOD, categories: [] }]);
    expect(list.retiredCategories).toEqual([]);
  });

  it.each(orders([groceries, retired, deleted, spent, deleted]))(
    "keeps a deleted category with history as retired in the order %j",
    async (_ids, order) => {
      await receiveEvents([food], 0);
      for (const event of order) await receiveEvents([event], 0);

      expect(await retiredNames()).toEqual(["Groceries"]);
    }
  );

  it.each(
    orders([groceries, retired, deleted, groceriesEvent("e-restored", "category.restored", 5000)])
  )("restores a deleted category as retired in the order %j", async (_ids, order) => {
    await receiveEvents([food], 0);
    for (const event of order) await receiveEvents([event], 0);

    expect(await retiredNames()).toEqual(["Groceries"]);
  });

  it("hides a deleted group, and keeps one holding a category as retired", async () => {
    const foodRetired = groupEvent("e-food-retired", FOOD, "category_group.retired", 1500);
    const foodDeleted = groupEvent("e-food-deleted", FOOD, "category_group.deleted", 1600);
    await receiveEvents([food, foodRetired, foodDeleted], 0);
    expect((await readCategoryList()).retiredGroups).toEqual([]);

    // Another device added and retired Groceries in Food before it saw the delete.
    await receiveEvents([groceries, retired], 0);
    expect((await readCategoryList()).retiredGroups).toMatchObject([{ id: FOOD }]);
  });
});
