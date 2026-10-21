import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { describeEvent } from "@/lib/events/projector";
import { receiveEvents, type LoggedEvent } from "@/lib/events/log";
import { HOUSEHOLD, loggedEvent } from "@/test/events";
import { getAllocation, listAllocations } from "./projection";

const ALLOCATION = "eeeeeeee-0000-4000-8000-000000000001";
const BANK = "aaaaaaaa-0000-4000-8000-000000000001";
const WALLET = "aaaaaaaa-0000-4000-8000-000000000002";
const GROCERIES = "cccccccc-0000-4000-8000-000000000001";
const RENT = "cccccccc-0000-4000-8000-000000000002";

const event = (
  id: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {},
  overrides: Partial<LoggedEvent> = {}
): LoggedEvent => ({
  ...loggedEvent({
    id,
    entityType: "allocation",
    entityId: ALLOCATION,
    eventType,
    millis,
    payload,
  }),
  ...overrides,
});

const details = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-10-12",
  accountId: BANK,
  from: { kind: "unassigned" },
  to: { kind: "category", id: GROCERIES },
  amountCents: 800000,
  ...overrides,
});

const created = event("e-created", "allocation.created", 1000, details());
const edited = event(
  "e-edited",
  "allocation.edited",
  2000,
  details({ amountCents: 500000, to: { kind: "category", id: RENT } })
);
const removed = event("e-removed", "allocation.removed", 3000);
const restored = event("e-restored", "allocation.restored", 4000);

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("allocation projection", () => {
  it.each(orders([created, edited, removed, restored]))(
    "gives the same allocation for the order %j",
    async (_ids, order) => {
      for (const arriving of order) await receiveEvents([arriving], 0);

      expect(await getAllocation(ALLOCATION)).toEqual({
        id: ALLOCATION,
        householdId: HOUSEHOLD,
        visibility: "household",
        ownerUserId: null,
        date: "2026-10-12",
        accountId: BANK,
        from: { kind: "unassigned" },
        to: { kind: "category", id: RENT },
        amountCents: 500000,
        removed: false,
        recordedHlc: created.hlc,
      });
    }
  );

  it("keeps a removal made after an edit on another device", async () => {
    const removedLater = event("e-removed-later", "allocation.removed", 5000);
    await receiveEvents([removedLater, edited, created, removed, restored], 0);

    expect(await getAllocation(ALLOCATION)).toMatchObject({ amountCents: 500000, removed: true });
    expect(await listAllocations()).toEqual([]);
  });

  it("ignores a duplicate event", async () => {
    await receiveEvents([created, edited], 0);
    await receiveEvents([created, edited], 0);

    expect(await listAllocations()).toMatchObject([{ id: ALLOCATION, amountCents: 500000 }]);
  });

  it("ignores a change carrying another visibility", async () => {
    const crossing = event(
      "e-crossing",
      "allocation.edited",
      2500,
      details({ accountId: WALLET }),
      { visibility: "personal", ownerUserId: "user-b" }
    );
    await receiveEvents([crossing, created], 0);

    expect(await getAllocation(ALLOCATION)).toMatchObject({ accountId: BANK });
  });

  it.each([
    ["the same envelope on both sides", { to: { kind: "unassigned" } }],
    ["an unknown envelope kind", { from: { kind: "budget", id: GROCERIES } }],
    ["a category without an ID", { to: { kind: "category" } }],
    ["a zero amount", { amountCents: 0 }],
    ["an impossible date", { date: "2026-02-30" }],
  ])("projects nothing from a create with %s", async (_case, broken) => {
    await receiveEvents([event("e-broken", "allocation.created", 1000, details(broken))], 0);

    expect(await getAllocation(ALLOCATION)).toBeUndefined();
  });

  it("lists the newest date first, then the most recently recorded", async () => {
    const second = "eeeeeeee-0000-4000-8000-000000000002";
    const third = "eeeeeeee-0000-4000-8000-000000000003";
    await receiveEvents(
      [
        created,
        event("e-2", "allocation.created", 1500, details(), { entityId: second }),
        event("e-3", "allocation.created", 900, details({ date: "2026-10-13" }), {
          entityId: third,
        }),
      ],
      0
    );

    expect((await listAllocations()).map((allocation) => allocation.id)).toEqual([
      third,
      second,
      ALLOCATION,
    ]);
  });

  it("describes a change by its amount", async () => {
    await receiveEvents([created], 0);

    expect(await describeEvent(created)).toBe("Move money: ₱8,000.00");
    expect(await describeEvent(removed)).toBe("Remove allocation: ₱8,000.00");
  });
});
