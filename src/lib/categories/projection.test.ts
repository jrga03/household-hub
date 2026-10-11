import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents, type LoggedEvent } from "@/lib/events/log";
import { readCategoryList } from "./projection";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const FOOD = "bbbbbbbb-0000-4000-8000-000000000001";
const BILLS = "bbbbbbbb-0000-4000-8000-000000000002";
const GROCERIES = "cccccccc-0000-4000-8000-000000000001";

const hlcAt = (millis: number, device = "device-b") =>
  `${String(millis).padStart(15, "0")}-000000-${device}`;

function categoryEvent(
  eventId: string,
  entityType: "category" | "category_group",
  entityId: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {}
): LoggedEvent {
  return {
    id: eventId,
    householdId: HOUSEHOLD,
    visibility: "household",
    ownerUserId: null,
    entityType,
    entityId,
    eventType,
    eventVersion: 1,
    hlc: hlcAt(millis),
    deviceId: "device-b",
    actorUserId: "user-b",
    payload,
  };
}

const groupEvent = (
  eventId: string,
  groupId: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {}
) => categoryEvent(eventId, "category_group", groupId, eventType, millis, payload);

const categoryOnlyEvent = (
  eventId: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {}
) => categoryEvent(eventId, "category", GROCERIES, eventType, millis, payload);

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ])
  );
}

const orders = (events: LoggedEvent[]) =>
  permutations(events).map((order) => [order.map((event) => event.id), order] as const);

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

describe("seeding on two devices", () => {
  // Both devices seed the same deterministic IDs with their own event IDs and clocks.
  const foodOnA = groupEvent("e-food-a", FOOD, "category_group.created", 1000, { name: "Food" });
  const groceriesOnA = categoryOnlyEvent("e-groceries-a", "category.created", 1001, {
    name: "Groceries",
    groupId: FOOD,
  });
  const renamedOnA = categoryOnlyEvent("e-renamed-a", "category.renamed", 2000, {
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

describe("visibility", () => {
  const personal = { visibility: "personal" as const, ownerUserId: "user-b" };
  const food = groupEvent("e-food", FOOD, "category_group.created", 1000, { name: "Food" });
  const mine = {
    ...groupEvent("e-mine", BILLS, "category_group.created", 2000, { name: "Mine" }),
    ...personal,
  };

  it("ignores a change that doesn't carry the category's own visibility and owner", async () => {
    const groceries = categoryOnlyEvent("e-groceries", "category.created", 3000, {
      name: "Groceries",
      groupId: FOOD,
    });
    const personalRename = {
      ...categoryOnlyEvent("e-renamed", "category.renamed", 4000, { name: "Mine now" }),
      ...personal,
    };
    await receiveEvents([food, groceries, personalRename], 0);

    expect((await readCategoryList()).groups).toMatchObject([
      { id: FOOD, categories: [{ name: "Groceries", visibility: "household" }] },
    ]);
  });

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
