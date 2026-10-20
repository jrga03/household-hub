import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { readCategoryList } from "./projection";
import { FOOD, GROCERIES, groceriesEvent, groupEvent, hlcAt } from "./projection.fixtures";

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("seeding on two devices", () => {
  // Both devices seed the same deterministic IDs with their own event IDs and clocks.
  const foodOnA = groupEvent("e-food-a", FOOD, "category_group.created", 1000, { name: "Food" });
  const groceriesOnA = groceriesEvent("e-groceries-a", "category.created", 1001, {
    name: "Groceries",
    groupId: FOOD,
  });
  const renamedOnA = groceriesEvent("e-renamed-a", "category.renamed", 2000, {
    name: "Market",
  });
  const foodRenamedOnA = groupEvent("e-food-renamed-a", FOOD, "category_group.renamed", 2001, {
    name: "Meals",
  });
  const foodOnB = { ...foodOnA, id: "e-food-b", hlc: hlcAt(3000, "device-c") };
  const groceriesOnB = { ...groceriesOnA, id: "e-groceries-b", hlc: hlcAt(3001, "device-c") };

  it.each(orders([foodOnA, groceriesOnA, renamedOnA, foodRenamedOnA, foodOnB, groceriesOnB]))(
    "gives one set, keeping the renames made between the seeds, in the order %j",
    async (_ids, order) => {
      for (const event of order) await receiveEvents([event], 0);

      const list = await readCategoryList();
      expect(list.groups).toMatchObject([
        { id: FOOD, name: "Meals", categories: [{ id: GROCERIES, name: "Market" }] },
      ]);
    }
  );
});
