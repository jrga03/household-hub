import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { describeEvent } from "@/lib/events/projector";
import { receiveEvents } from "@/lib/events/log";
import { HOUSEHOLD, loggedEvent, type EventFields } from "@/test/events";
import { budgetId, checkBudgetDetails } from "./events";
import { getBudget, listBudgets } from "./projection";

const BUDGET = "bbbbbbbb-0000-4000-8000-000000000001";
const BPI = "aaaaaaaa-0000-4000-8000-000000000001";
const GCASH = "aaaaaaaa-0000-4000-8000-000000000002";
const GROCERIES = "cccccccc-0000-4000-8000-000000000001";

const event = (
  id: string,
  millis: number,
  payload: Record<string, unknown>,
  overrides: Partial<EventFields> = {}
) =>
  loggedEvent({
    id,
    entityType: "budget",
    entityId: BUDGET,
    eventType: "budget.set",
    millis,
    payload,
    ...overrides,
  });

const set = (overrides: Record<string, unknown> = {}) => ({
  categoryId: GROCERIES,
  fromMonth: "2026-10",
  amountCents: 800000,
  accountId: BPI,
  ...overrides,
});

const onDeviceA = event("e-a", 1000, set(), { device: "device-a" });
const onDeviceB = event("e-b", 2000, set({ amountCents: 900000, accountId: GCASH }));
const cleared = event("e-clear", 3000, set({ amountCents: null, accountId: null }));

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("budget projection", () => {
  it.each(orders([onDeviceA, onDeviceB]))(
    "keeps the latest set within a month for the order %j",
    async (_ids, order) => {
      for (const arriving of order) await receiveEvents([arriving], 0);

      expect(await getBudget(BUDGET)).toEqual({
        id: BUDGET,
        householdId: HOUSEHOLD,
        visibility: "household",
        ownerUserId: null,
        categoryId: GROCERIES,
        fromMonth: "2026-10",
        amountCents: 900000,
        accountId: GCASH,
      });
    }
  );

  it.each(orders([onDeviceA, onDeviceB, cleared]))(
    "keeps a later clear for the order %j",
    async (_ids, order) => {
      for (const arriving of order) await receiveEvents([arriving], 0);

      expect(await getBudget(BUDGET)).toMatchObject({ amountCents: null, accountId: null });
    }
  );

  it("treats a zero amount as a clear", async () => {
    await receiveEvents([onDeviceA, event("e-zero", 2000, set({ amountCents: 0 }))], 0);

    expect(await getBudget(BUDGET)).toMatchObject({ amountCents: null, accountId: null });
  });

  it("ignores a duplicate event", async () => {
    await receiveEvents([onDeviceA, onDeviceB], 0);
    await receiveEvents([onDeviceA, onDeviceB], 0);

    expect(await listBudgets()).toMatchObject([{ id: BUDGET, amountCents: 900000 }]);
  });

  it("ignores a set carrying another visibility", async () => {
    const crossing = event("e-crossing", 2500, set({ amountCents: 1 }), {
      visibility: "personal",
      ownerUserId: "user-b",
    });
    await receiveEvents([crossing, onDeviceA], 0);

    expect(await getBudget(BUDGET)).toMatchObject({ amountCents: 800000 });
  });

  it("ignores a later set naming another category or month", async () => {
    const otherMonth = event("e-other-month", 2500, set({ fromMonth: "2026-11", amountCents: 1 }));
    const otherCategory = event(
      "e-other-category",
      2600,
      set({ categoryId: "cccccccc-0000-4000-8000-000000000002", amountCents: 2 })
    );
    await receiveEvents([otherCategory, otherMonth, onDeviceA], 0);

    expect(await getBudget(BUDGET)).toMatchObject({ fromMonth: "2026-10", amountCents: 800000 });
  });

  it.each([
    ["an impossible month", { fromMonth: "2026-13" }],
    ["a day instead of a month", { fromMonth: "2026-10-01" }],
    ["no category", { categoryId: "" }],
    ["a negative amount", { amountCents: -100 }],
    ["a fractional amount", { amountCents: 10.5 }],
    ["an amount but no funding account", { accountId: null }],
  ])("projects nothing from a set with %s", async (_case, broken) => {
    await receiveEvents([event("e-broken", 1000, set(broken))], 0);

    expect(await getBudget(BUDGET)).toBeUndefined();
  });

  it("explains a negative amount", () => {
    expect(checkBudgetDetails(set({ amountCents: -100 })).problem).toBe(
      "A budget must be more than zero and at most ₱9,999,999.99. Enter 0 to clear it."
    );
  });

  it("describes a set by its amount and month, and a clear", async () => {
    await receiveEvents([onDeviceA], 0);

    expect(await describeEvent(onDeviceA)).toBe("Set budget: ₱8,000.00 from October 2026");
    expect(await describeEvent(cleared)).toBe("Clear budget from October 2026");
  });
});

describe("budgetId", () => {
  it("is the same for the same category and month on every device", async () => {
    const first = await budgetId(GROCERIES, "2026-10");

    expect(await budgetId(GROCERIES, "2026-10")).toBe(first);
    expect(await budgetId(GROCERIES, "2026-11")).not.toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
