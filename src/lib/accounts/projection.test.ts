import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents, type LoggedEvent } from "@/lib/events/log";
import { listAccounts } from "./projection";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const CASH_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const BANK_ID = "aaaaaaaa-0000-4000-8000-000000000002";

function accountCreated(
  eventId: string,
  entityId: string,
  hlc: string,
  payload: Record<string, unknown>
): LoggedEvent {
  return {
    id: eventId,
    householdId: HOUSEHOLD,
    visibility: "household",
    ownerUserId: null,
    entityType: "account",
    entityId,
    eventType: "account.created",
    eventVersion: 1,
    hlc,
    deviceId: "device-b",
    actorUserId: "user-b",
    payload,
  };
}

const cash = accountCreated("e-cash", CASH_ID, "000000000001000-000000-device-b", {
  name: "Cash",
  type: "cash",
  startingBalanceCents: 50_000,
});
const bank = accountCreated("e-bank", BANK_ID, "000000000002000-000000-device-b", {
  name: "BDO Savings",
  type: "bank",
  startingBalanceCents: 1_250_075,
});
// The same account created twice (never expected, but projections must stay
// deterministic): the later HLC wins.
const cashAgainLater = accountCreated("e-cash-2", CASH_ID, "000000000003000-000000-device-a", {
  name: "Wallet",
  type: "cash",
  startingBalanceCents: 70_000,
});

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ])
  );
}

const EXPECTED_ACCOUNTS = [
  {
    id: BANK_ID,
    name: "BDO Savings",
    type: "bank",
    visibility: "household",
    startingBalanceCents: 1_250_075,
  },
  {
    id: CASH_ID,
    name: "Wallet",
    type: "cash",
    visibility: "household",
    startingBalanceCents: 70_000,
  },
];

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("account projection", () => {
  it.each(
    permutations([cash, bank, cashAgainLater]).map((order) => [order.map((e) => e.id), order])
  )("builds the same accounts from events in the order %j", async (_ids, order) => {
    for (const event of order) {
      await receiveEvents([event], 0);
    }

    expect(await listAccounts()).toMatchObject(EXPECTED_ACCOUNTS);
  });

  it("builds the same accounts when the events arrive in one batch", async () => {
    await receiveEvents([cashAgainLater, bank, cash], 0);

    expect(await listAccounts()).toMatchObject(EXPECTED_ACCOUNTS);
  });

  it("ignores a duplicate event", async () => {
    await receiveEvents([cash, bank], 0);
    await receiveEvents([cash, cash], 0);

    expect(await listAccounts()).toHaveLength(2);
  });

  it("skips an event whose payload is not a valid account", async () => {
    const broken = accountCreated("e-broken", "aaaaaaaa-0000-4000-8000-000000000009", cash.hlc, {
      name: "",
      type: "cash",
      startingBalanceCents: 1.5,
    });

    await receiveEvents([broken, bank], 0);

    expect(await listAccounts()).toMatchObject([{ id: BANK_ID }]);
  });

  it("keeps an event of a type this version doesn't know without projecting it", async () => {
    const fromNewerApp = { ...bank, id: "e-future", eventType: "account.renamed" };

    await expect(receiveEvents([fromNewerApp], 0)).resolves.toBeUndefined();
    expect(await listAccounts()).toHaveLength(0);
  });
});
