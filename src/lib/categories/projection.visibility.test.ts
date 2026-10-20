import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { readCategoryList } from "./projection";
import { BILLS, FOOD, GROCERIES, categoryOnlyEvent, groupEvent } from "./projection.fixtures";

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("visibility", () => {
  const personal = { visibility: "personal" as const, ownerUserId: "user-b" };
  const food = groupEvent("e-food", FOOD, "category_group.created", 1000, { name: "Food" });
  const mine = {
    ...groupEvent("e-mine", BILLS, "category_group.created", 2000, { name: "Mine" }),
    ...personal,
  };

  const groceries = categoryOnlyEvent("e-groceries", "category.created", 3000, {
    name: "Groceries",
    groupId: FOOD,
  });
  const personalRename = {
    ...categoryOnlyEvent("e-renamed", "category.renamed", 4000, { name: "Mine now" }),
    ...personal,
  };
  const personalMove = {
    ...categoryOnlyEvent("e-moved", "category.moved", 5000, { groupId: BILLS }),
    ...personal,
  };

  it.each(orders([food, mine, groceries, personalRename, personalMove]))(
    "ignores changes that don't carry the category's own visibility and owner, in the order %j",
    async (_ids, order) => {
      for (const event of order) await receiveEvents([event], 0);

      expect((await readCategoryList()).groups).toMatchObject([
        { id: FOOD, categories: [{ name: "Groceries", visibility: "household", groupId: FOOD }] },
        { id: BILLS, categories: [] },
      ]);
    }
  );

  it("lists a category as ungrouped while its group is missing or of another visibility", async () => {
    const inMine = categoryOnlyEvent("e-groceries", "category.created", 3000, {
      name: "Groceries",
      groupId: BILLS,
    });
    await receiveEvents([inMine], 0);
    expect((await readCategoryList()).ungrouped).toMatchObject([{ id: GROCERIES }]);

    await receiveEvents([food, mine], 0);
    const list = await readCategoryList();
    expect(list.ungrouped).toMatchObject([{ id: GROCERIES }]);
    expect(list.groups.flatMap((group) => group.categories)).toEqual([]);
  });

  it("keeps a Personal category in its owner's Personal group", async () => {
    const savings = {
      ...categoryOnlyEvent("e-savings", "category.created", 3000, {
        name: "Travel",
        groupId: BILLS,
      }),
      ...personal,
    };
    await receiveEvents([mine, savings], 0);

    expect((await readCategoryList()).groups).toMatchObject([
      {
        id: BILLS,
        visibility: "personal",
        categories: [{ name: "Travel", visibility: "personal", ownerUserId: "user-b" }],
      },
    ]);
  });
});
