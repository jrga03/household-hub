import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents, type LoggedEvent } from "@/lib/events/log";
import { listTransactions } from "./projection";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const BANK = "aaaaaaaa-0000-4000-8000-000000000001";
const GROCERIES = "cccccccc-0000-4000-8000-000000000001";
const LUNCH = "dddddddd-0000-4000-8000-000000000001";

const hlcAt = (millis: number, device = "device-b") =>
  `${String(millis).padStart(15, "0")}-000000-${device}`;

function transactionEvent(
  eventId: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {},
  entityId = LUNCH
): LoggedEvent {
  return {
    id: eventId,
    householdId: HOUSEHOLD,
    visibility: "household",
    ownerUserId: null,
    entityType: "transaction",
    entityId,
    eventType,
    eventVersion: 1,
    hlc: hlcAt(millis),
    deviceId: "device-b",
    actorUserId: "user-b",
    payload,
  };
}

const lunchDetails = {
  date: "2026-10-12",
  type: "expense",
  amountCents: 25000,
  accountId: BANK,
  categoryId: GROCERIES,
  description: "Lunch",
  notes: "",
};

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("transaction projection", () => {
  const created = transactionEvent("e-created", "transaction.created", 1000, {
    ...lunchDetails,
    status: "pending",
  });

  it("lists a transaction another device recorded", async () => {
    await receiveEvents([created], 0);

    expect(await listTransactions()).toMatchObject([
      { id: LUNCH, ...lunchDetails, status: "pending", visibility: "household" },
    ]);
  });

  // One device edits the details, another marks it cleared; a third removes and restores it.
  const edited = transactionEvent("e-edited", "transaction.edited", 2000, {
    ...lunchDetails,
    amountCents: 27500,
    description: "Team lunch",
  });
  const cleared = transactionEvent("e-cleared", "transaction.marked_cleared", 1500);
  const removed = transactionEvent("e-removed", "transaction.removed", 3000);
  const restored = transactionEvent("e-restored", "transaction.restored", 4000);

  it.each(orders([created, edited, cleared, removed, restored]))(
    "keeps the later details, the later status and the later removal in the order %j",
    async (_ids, order) => {
      for (const event of order) await receiveEvents([event], 0);

      expect(await listTransactions()).toMatchObject([
        { id: LUNCH, amountCents: 27500, description: "Team lunch", status: "cleared" },
      ]);
    }
  );

  it("leaves a removed transaction out of the list", async () => {
    await receiveEvents([created, removed], 0);

    expect(await listTransactions()).toEqual([]);
  });

  it("ignores a duplicate event", async () => {
    await receiveEvents([created, edited, cleared], 0);
    await receiveEvents([cleared, edited, created], 0);

    expect(await listTransactions()).toMatchObject([
      { amountCents: 27500, status: "cleared", recordedHlc: created.hlc },
    ]);
  });

  it("ignores a change made with another visibility", async () => {
    const personalEdit = {
      ...transactionEvent("e-personal", "transaction.edited", 2000, {
        ...lunchDetails,
        amountCents: 1,
      }),
      visibility: "personal" as const,
      ownerUserId: "user-b",
    };
    await receiveEvents([created, personalEdit], 0);

    expect(await listTransactions()).toMatchObject([{ amountCents: 25000 }]);
  });

  it("skips a create whose amount isn't a positive whole number of cents", async () => {
    const broken = transactionEvent("e-broken", "transaction.created", 1000, {
      ...lunchDetails,
      amountCents: -100,
      status: "cleared",
    });
    await receiveEvents([broken], 0);

    expect(await listTransactions()).toEqual([]);
  });

  it("lists the newest date first, and within a day the most recently recorded first", async () => {
    const at = (id: string, millis: number, date: string, entityId: string) =>
      transactionEvent(
        id,
        "transaction.created",
        millis,
        {
          ...lunchDetails,
          date,
          description: id,
          status: "cleared",
        },
        entityId
      );
    await receiveEvents(
      [
        at("older-day", 5000, "2026-10-10", "dddddddd-0000-4000-8000-000000000002"),
        at("first-today", 1000, "2026-10-12", "dddddddd-0000-4000-8000-000000000003"),
        at("second-today", 2000, "2026-10-12", "dddddddd-0000-4000-8000-000000000004"),
      ],
      0
    );

    expect((await listTransactions()).map((row) => row.description)).toEqual([
      "second-today",
      "first-today",
      "older-day",
    ]);
  });
});
