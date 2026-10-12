import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed, receiveEvents } from "@/lib/events/log";
import { readCategoryList } from "@/lib/categories/projection";
import {
  createCategory,
  createGroup,
  moveCategory,
  renameCategory,
  renameGroup,
  retireCategory,
  retireGroup,
  seedDefaultCategories,
  unretireCategory,
  unretireGroup,
} from "./categories";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };
const OTHER_HOUSEHOLD = { householdId: "22222222-2222-4222-8222-222222222222", userId: "user-a" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const summary = async () =>
  (await readCategoryList()).groups.map((group) => [
    group.name,
    group.categories.map((category) => category.name),
  ]);

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("seedDefaultCategories", () => {
  it("adds the suggested Household groups and categories", async () => {
    await seedDefaultCategories(MEMBER);

    expect(await summary()).toEqual([
      ["Bills", ["Subscriptions", "Utilities"]],
      ["Food", ["Delivery", "Groceries", "Restaurants"]],
      ["Getting Around", ["Transportation"]],
      ["Personal", ["Allowances"]],
      ["Savings", ["Big Ticket Items", "Forever House", "Retirement"]],
    ]);
    const events = await listUnpushed(100);
    expect(events).toHaveLength(15);
    expect(events.every((event) => event.visibility === "household")).toBe(true);
    expect(events.every((event) => UUID.test(event.entityId))).toBe(true);
  });

  it("gives every device the same IDs, so two seeds sync into one set", async () => {
    await seedDefaultCategories(MEMBER);
    const onFirstDevice = await listUnpushed(100);
    await resetLocalDatabase();
    await seedDefaultCategories(MEMBER);
    const onSecondDevice = await listUnpushed(100);

    expect(onSecondDevice.map((event) => event.entityId)).toEqual(
      onFirstDevice.map((event) => event.entityId)
    );
    await receiveEvents(onFirstDevice, 0);
    expect((await readCategoryList()).groups).toHaveLength(5);
  });

  it("derives the IDs from the household", async () => {
    await seedDefaultCategories(MEMBER);
    const first = (await listUnpushed(100)).map((event) => event.entityId);
    await resetLocalDatabase();
    await seedDefaultCategories(OTHER_HOUSEHOLD);
    const second = (await listUnpushed(100)).map((event) => event.entityId);

    expect(second.filter((id) => first.includes(id))).toEqual([]);
  });

  it("appends nothing for defaults this device already holds", async () => {
    await seedDefaultCategories(MEMBER);
    await seedDefaultCategories(MEMBER);

    expect(await listUnpushed(100)).toHaveLength(15);
  });
});

describe("groups", () => {
  it("adds a Household group unless Personal is chosen", async () => {
    const food = await createGroup(MEMBER, { name: "  Food " });

    expect((await readCategoryList()).groups).toMatchObject([
      { id: food.id, name: "Food", visibility: "household", ownerUserId: null },
    ]);
    expect(await listUnpushed(10)).toMatchObject([
      {
        entityType: "category_group",
        entityId: food.id,
        eventType: "category_group.created",
        eventVersion: 1,
        visibility: "household",
        ownerUserId: null,
        payload: { name: "Food" },
      },
    ]);
  });

  it("keys a Personal group to the member who adds it", async () => {
    await createGroup(MEMBER, { name: "Mine", visibility: "personal" });

    expect(await listUnpushed(10)).toMatchObject([
      { visibility: "personal", ownerUserId: MEMBER.userId },
    ]);
  });

  it("refuses a group without a name", async () => {
    await expect(createGroup(MEMBER, { name: "   " })).rejects.toThrow("A group needs a name.");
    expect(await listUnpushed(10)).toEqual([]);
  });

  it("renames a group", async () => {
    const food = await createGroup(MEMBER, { name: "Food" });
    await renameGroup(MEMBER, food.id, "Meals");

    expect((await readCategoryList()).groups).toMatchObject([{ id: food.id, name: "Meals" }]);
  });

  it("retires a group only once its categories are retired", async () => {
    const food = await createGroup(MEMBER, { name: "Food" });
    const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
    await createCategory(MEMBER, { name: "Delivery", groupId: food.id });

    await expect(retireGroup(MEMBER, food.id)).rejects.toThrow(
      "Retire Delivery and Groceries first."
    );

    await retireCategory(MEMBER, groceries.id);
    const [delivery] = (await readCategoryList()).groups[0]?.categories ?? [];
    if (!delivery) throw new Error("Delivery is missing");
    await retireCategory(MEMBER, delivery.id);
    await retireGroup(MEMBER, food.id);

    const list = await readCategoryList();
    expect(list.groups).toEqual([]);
    expect(list.retiredGroups).toMatchObject([{ id: food.id }]);
  });

  it("unretires a group", async () => {
    const food = await createGroup(MEMBER, { name: "Food" });
    await retireGroup(MEMBER, food.id);
    await unretireGroup(MEMBER, food.id);

    expect((await readCategoryList()).groups).toMatchObject([{ id: food.id, retired: false }]);
  });
});

describe("categories", () => {
  it("takes its group's visibility and owner", async () => {
    const mine = await createGroup(MEMBER, { name: "Mine", visibility: "personal" });
    const travel = await createCategory(MEMBER, { name: "Travel", groupId: mine.id });

    expect((await readCategoryList()).groups).toMatchObject([
      {
        id: mine.id,
        categories: [{ id: travel.id, visibility: "personal", ownerUserId: MEMBER.userId }],
      },
    ]);
    expect((await listUnpushed(10)).at(-1)).toMatchObject({
      entityType: "category",
      entityId: travel.id,
      eventType: "category.created",
      eventVersion: 1,
      visibility: "personal",
      ownerUserId: MEMBER.userId,
      payload: { name: "Travel", groupId: mine.id },
    });
  });

  it("refuses a group this device doesn't hold, or a retired one", async () => {
    await expect(
      createCategory(MEMBER, { name: "Groceries", groupId: crypto.randomUUID() })
    ).rejects.toThrow("That group no longer exists.");

    const food = await createGroup(MEMBER, { name: "Food" });
    await retireGroup(MEMBER, food.id);
    await expect(createCategory(MEMBER, { name: "Groceries", groupId: food.id })).rejects.toThrow(
      "Food is retired. Unretire it first."
    );
  });

  it("renames a category", async () => {
    const food = await createGroup(MEMBER, { name: "Food" });
    const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
    await renameCategory(MEMBER, groceries.id, "Market");

    expect((await readCategoryList()).groups).toMatchObject([
      { categories: [{ id: groceries.id, name: "Market" }] },
    ]);
    await expect(renameCategory(MEMBER, groceries.id, "")).rejects.toThrow(
      "A category needs a name."
    );
  });

  it("moves a category to another group of the same visibility", async () => {
    const food = await createGroup(MEMBER, { name: "Food" });
    const bills = await createGroup(MEMBER, { name: "Bills" });
    const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
    await moveCategory(MEMBER, groceries.id, bills.id);

    expect((await readCategoryList()).groups).toMatchObject([
      { id: bills.id, categories: [{ id: groceries.id }] },
      { id: food.id, categories: [] },
    ]);
    expect((await listUnpushed(10)).at(-1)).toMatchObject({
      eventType: "category.moved",
      payload: { groupId: bills.id },
    });
  });

  it("refuses a move across visibility or into a retired group", async () => {
    const food = await createGroup(MEMBER, { name: "Food" });
    const mine = await createGroup(MEMBER, { name: "Mine", visibility: "personal" });
    const old = await createGroup(MEMBER, { name: "Old" });
    await retireGroup(MEMBER, old.id);
    const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });

    await expect(moveCategory(MEMBER, groceries.id, mine.id)).rejects.toThrow(
      "Choose a Household group."
    );
    await expect(moveCategory(MEMBER, groceries.id, old.id)).rejects.toThrow(
      "Old is retired. Unretire it first."
    );
  });

  it("retires and unretires a category, refusing while its group is retired", async () => {
    const food = await createGroup(MEMBER, { name: "Food" });
    const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
    await retireCategory(MEMBER, groceries.id);
    await retireGroup(MEMBER, food.id);

    expect((await readCategoryList()).retiredCategories).toMatchObject([{ id: groceries.id }]);
    await expect(unretireCategory(MEMBER, groceries.id)).rejects.toThrow(
      "Food is retired. Unretire it first."
    );

    await unretireGroup(MEMBER, food.id);
    await unretireCategory(MEMBER, groceries.id);
    expect((await readCategoryList()).groups).toMatchObject([
      { id: food.id, categories: [{ id: groceries.id }] },
    ]);
  });
});
