import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { describeEvent } from "@/lib/events/projector";
import { receiveEvents, type LoggedEvent } from "@/lib/events/log";
import { HOUSEHOLD, loggedEvent } from "@/test/events";
import { getBalanceCorrection, listBalanceCorrections } from "./projection";

const CORRECTION = "eeeeeeee-0000-4000-8000-000000000001";
const BANK = "aaaaaaaa-0000-4000-8000-000000000001";
const GROCERIES = "cccccccc-0000-4000-8000-000000000001";

const event = (
  id: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {},
  overrides: Partial<LoggedEvent> = {}
): LoggedEvent => ({
  ...loggedEvent({
    id,
    entityType: "balance_correction",
    entityId: CORRECTION,
    eventType,
    millis,
    payload,
  }),
  ...overrides,
});

const details = (overrides: Record<string, unknown> = {}) => ({
  accountId: BANK,
  date: "2026-10-12",
  amountCents: 35000,
  direction: "lower",
  envelope: { kind: "category", id: GROCERIES },
  payingAccountId: null,
  ...overrides,
});

const created = event("e-created", "balance_correction.created", 1000, details());
const removed = event("e-removed", "balance_correction.removed", 2000);
const restored = event("e-restored", "balance_correction.restored", 3000);

const bank = event(
  "e-bank",
  "account.created",
  500,
  { name: "BPI", type: "bank", startingBalanceCents: 0, payingAccountId: null },
  { entityType: "account", entityId: BANK, eventVersion: 2 }
);

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("balance correction projection", () => {
  it.each(orders([created, removed, restored]))(
    "gives the same correction for the order %j",
    async (_ids, order) => {
      for (const arriving of order) await receiveEvents([arriving], 0);

      expect(await getBalanceCorrection(CORRECTION)).toEqual({
        id: CORRECTION,
        householdId: HOUSEHOLD,
        visibility: "household",
        ownerUserId: null,
        accountId: BANK,
        date: "2026-10-12",
        amountCents: 35000,
        direction: "lower",
        envelope: { kind: "category", id: GROCERIES },
        payingAccountId: null,
        removed: false,
        recordedHlc: created.hlc,
      });
    }
  );

  it("keeps a removal made after a restore on another device", async () => {
    const removedLater = event("e-removed-later", "balance_correction.removed", 4000);
    await receiveEvents([removedLater, restored, created, removed], 0);

    expect(await getBalanceCorrection(CORRECTION)).toMatchObject({ removed: true });
    expect(await listBalanceCorrections()).toEqual([]);
  });

  it("ignores a duplicate event", async () => {
    await receiveEvents([created], 0);
    await receiveEvents([created], 0);

    expect(await listBalanceCorrections()).toMatchObject([{ id: CORRECTION }]);
  });

  it("ignores a second create", async () => {
    const recreated = event("e-recreated", "balance_correction.created", 1500, {
      ...details({ amountCents: 1 }),
    });
    await receiveEvents([recreated, created], 0);

    expect(await getBalanceCorrection(CORRECTION)).toMatchObject({ amountCents: 35000 });
  });

  it("ignores a change carrying another visibility", async () => {
    const crossing = event(
      "e-crossing",
      "balance_correction.removed",
      2500,
      {},
      {
        visibility: "personal",
        ownerUserId: "user-b",
      }
    );
    await receiveEvents([crossing, created], 0);

    expect(await getBalanceCorrection(CORRECTION)).toMatchObject({ removed: false });
  });

  it.each([
    ["no account", { accountId: "" }],
    ["a zero amount", { amountCents: 0 }],
    ["a negative amount", { amountCents: -100 }],
    ["an unknown direction", { direction: "sideways" }],
    ["a Card Payment envelope", { envelope: { kind: "card_payment", id: BANK } }],
    ["an impossible date", { date: "2026-02-30" }],
  ])("projects nothing from a create with %s", async (_case, broken) => {
    await receiveEvents(
      [event("e-broken", "balance_correction.created", 1000, details(broken))],
      0
    );

    expect(await getBalanceCorrection(CORRECTION)).toBeUndefined();
  });

  it("lists the newest date first, then the most recently recorded", async () => {
    const second = "eeeeeeee-0000-4000-8000-000000000002";
    const third = "eeeeeeee-0000-4000-8000-000000000003";
    const createdAs = (entityId: string, millis: number, date = "2026-10-12") =>
      event(`e-${entityId}`, "balance_correction.created", millis, details({ date }), {
        entityId,
      });
    await receiveEvents([created, createdAs(second, 1500), createdAs(third, 900, "2026-10-13")], 0);

    expect((await listBalanceCorrections()).map((correction) => correction.id)).toEqual([
      third,
      second,
      CORRECTION,
    ]);
  });

  it("describes a change by its account's name", async () => {
    await receiveEvents([bank, created], 0);

    expect(await describeEvent(created)).toBe("Correct balance: BPI");
    expect(await describeEvent(removed)).toBe("Remove correction: BPI");
    expect(await describeEvent(restored)).toBe("Restore correction: BPI");
  });

  it("describes a change on an account not on this device yet", async () => {
    expect(await describeEvent(created)).toBe("Correct balance");
  });
});
