import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { loggedEvent } from "@/test/events";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { readPaydays } from "./projection";

const FIFTEENTH = "dddddddd-0000-4000-8000-000000000001";
const THIRTIETH = "dddddddd-0000-4000-8000-000000000002";
const BONUS = "dddddddd-0000-4000-8000-000000000003";

const paydayEvent = (
  eventId: string,
  paydayId: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {}
) =>
  loggedEvent({
    id: eventId,
    entityType: "payday",
    entityId: paydayId,
    eventType,
    millis,
    payload,
  });

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("payday projection", () => {
  const fifteenth = paydayEvent("e-15", FIFTEENTH, "payday.created", 1000, {
    name: "15th",
    position: 0,
  });
  const thirtieth = paydayEvent("e-30", THIRTIETH, "payday.created", 2000, {
    name: "30th salary",
    position: 1,
  });
  const bonus = paydayEvent("e-bonus", BONUS, "payday.created", 3000, {
    name: "Bonus",
    position: 2,
  });
  const renamed = paydayEvent("e-renamed", FIFTEENTH, "payday.renamed", 4000, {
    name: "15th salary",
  });
  // Another device renamed it earlier; the later rename wins.
  const earlierRename = paydayEvent("e-earlier", FIFTEENTH, "payday.renamed", 3500, {
    name: "Mid-month",
  });
  const movedFirst = paydayEvent("e-moved", THIRTIETH, "payday.reordered", 5000, {
    position: -1,
  });
  const deleted = paydayEvent("e-deleted", BONUS, "payday.deleted", 6000);

  it.each(orders([fifteenth, thirtieth, bonus, renamed, movedFirst, deleted]))(
    "builds the same paydays from events in the order %j",
    async (_ids, order) => {
      for (const event of order) await receiveEvents([event], 0);

      expect(await readPaydays()).toMatchObject([
        { id: THIRTIETH, name: "30th salary" },
        { id: FIFTEENTH, name: "15th salary" },
      ]);
    }
  );

  it.each(orders([fifteenth, renamed, earlierRename]))(
    "keeps the later of two renames in the order %j",
    async (_ids, order) => {
      for (const event of order) await receiveEvents([event], 0);

      expect(await readPaydays()).toMatchObject([{ name: "15th salary" }]);
    }
  );

  // Device A swaps the two paydays; device B, later, swaps them back.
  const swapA = [
    paydayEvent("e-a15", FIFTEENTH, "payday.reordered", 4000, { position: 1 }),
    paydayEvent("e-a30", THIRTIETH, "payday.reordered", 4000, { position: 0 }),
  ];
  const swapB = [
    paydayEvent("e-b15", FIFTEENTH, "payday.reordered", 5000, { position: 0 }),
    paydayEvent("e-b30", THIRTIETH, "payday.reordered", 5000, { position: 1 }),
  ];

  it.each(orders([fifteenth, thirtieth, ...swapA, ...swapB]))(
    "keeps the later of two devices' reorders, even with every event twice, in the order %j",
    async (_ids, order) => {
      for (const event of order) await receiveEvents([event], 0);
      await receiveEvents(order.toReversed(), 0);

      expect((await readPaydays()).map((payday) => payday.id)).toEqual([FIFTEENTH, THIRTIETH]);
    }
  );

  const retired = paydayEvent("e-retired", FIFTEENTH, "payday.retired", 7000);
  const unretired = paydayEvent("e-unretired", FIFTEENTH, "payday.unretired", 8000);

  it.each(orders([fifteenth, thirtieth, retired, unretired]))(
    "keeps the later of a retire and an unretire in the order %j",
    async (_ids, order) => {
      for (const event of order) await receiveEvents([event], 0);

      expect(await readPaydays()).toMatchObject([
        { id: FIFTEENTH, retired: false },
        { id: THIRTIETH, retired: false },
      ]);
    }
  );

  it.each(orders([fifteenth, thirtieth, retired]))(
    "keeps a retired payday in the list, marked retired, in the order %j",
    async (_ids, order) => {
      for (const event of order) await receiveEvents([event], 0);

      expect(await readPaydays()).toMatchObject([
        { id: FIFTEENTH, retired: true },
        { id: THIRTIETH, retired: false },
      ]);
    }
  );

  // Device A deletes the bonus; device B, offline, gives a budget a portion on it.
  const namedOnDeviceB = loggedEvent({
    id: "e-budget",
    entityType: "budget",
    entityId: "bbbbbbbb-0000-4000-8000-000000000001",
    eventType: "budget.set",
    eventVersion: 2,
    millis: 7000,
    payload: {
      categoryId: "cccccccc-0000-4000-8000-000000000001",
      fromMonth: "2026-10",
      amountCents: 500000,
      accountId: "aaaaaaaa-0000-4000-8000-000000000001",
      portions: [{ paydayId: BONUS, amountCents: 500000 }],
    },
  });

  it.each(orders([bonus, deleted, namedOnDeviceB]))(
    "brings a deleted payday back retired once a budget names it, in the order %j",
    async (_ids, order) => {
      for (const event of order) await receiveEvents([event], 0);

      expect(await readPaydays()).toMatchObject([{ id: BONUS, name: "Bonus", retired: true }]);
    }
  );

  it("ignores a duplicate event", async () => {
    await receiveEvents([fifteenth, renamed], 0);
    await receiveEvents([renamed, fifteenth, fifteenth], 0);

    expect(await readPaydays()).toMatchObject([{ id: FIFTEENTH, name: "15th salary" }]);
  });

  it("orders paydays with the same position by ID, so every device agrees", async () => {
    const tied = paydayEvent("e-tied", FIFTEENTH, "payday.reordered", 4000, { position: 1 });
    await receiveEvents([tied, thirtieth, fifteenth], 0);

    expect((await readPaydays()).map((payday) => payday.id)).toEqual([FIFTEENTH, THIRTIETH]);
  });

  it("skips a create whose name is blank", async () => {
    const blank = paydayEvent("e-blank", BONUS, "payday.created", 3000, {
      name: "  ",
      position: 2,
    });
    await receiveEvents([fifteenth, blank], 0);

    expect(await readPaydays()).toMatchObject([{ id: FIFTEENTH }]);
  });
});
