import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents, type LoggedEvent } from "@/lib/events/log";
import { listAccounts, listRetiredAccounts } from "./projection";

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
    eventVersion: 2,
    hlc,
    deviceId: "device-b",
    actorUserId: "user-b",
    payload: { payingAccountId: null, ...payload },
  };
}

function accountEdited(
  eventId: string,
  entityId: string,
  hlc: string,
  payload: Record<string, unknown>
): LoggedEvent {
  return {
    ...accountCreated(eventId, entityId, hlc, payload),
    eventType: "account.edited",
    eventVersion: 1,
    deviceId: hlc.slice(-8),
    payload,
  };
}

function accountRetirement(
  eventType: "account.retired" | "account.unretired",
  eventId: string,
  hlc: string
): LoggedEvent {
  return {
    ...accountCreated(eventId, CASH_ID, hlc, {}),
    eventType,
    eventVersion: 1,
    deviceId: hlc.slice(-8),
    payload: {},
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

  const personalSavings: LoggedEvent = {
    ...accountCreated("e-savings", BANK_ID, "000000000001000-000000-device-b", {
      name: "Savings",
      type: "bank",
      startingBalanceCents: 0,
    }),
    visibility: "personal",
    ownerUserId: "user-b",
  };
  const savingsRenamedByOwner: LoggedEvent = {
    ...accountEdited("e-savings-2", BANK_ID, "000000000002000-000000-device-b", {
      name: "Rainy day",
      type: "bank",
      startingBalanceCents: 0,
    }),
    visibility: "personal",
    ownerUserId: "user-b",
  };
  const savingsMadeHousehold = accountEdited(
    "e-savings-3",
    BANK_ID,
    "000000000003000-000000-device-a",
    { name: "Joint savings", type: "bank", startingBalanceCents: 0 }
  );

  it.each(
    permutations([personalSavings, savingsRenamedByOwner, savingsMadeHousehold]).map((order) => [
      order.map((e) => e.id),
      order,
    ])
  )(
    "keeps the visibility and owner the account was created with, in the order %j",
    async (_ids, order) => {
      for (const event of order) {
        await receiveEvents([event], 0);
      }

      expect(await listAccounts()).toMatchObject([
        { id: BANK_ID, name: "Rainy day", visibility: "personal", ownerUserId: "user-b" },
      ]);
    }
  );

  describe("edits", () => {
    const groceries = accountCreated("e-groceries", CASH_ID, "000000000001000-000000-device-a", {
      name: "Groceries cash",
      type: "cash",
      startingBalanceCents: 10_000,
    });
    const editOnA = accountEdited("e-edit-a", CASH_ID, "000000000005000-000000-device-a", {
      name: "Market cash",
      type: "cash",
      startingBalanceCents: 12_000,
    });
    const laterEditOnB = accountEdited("e-edit-b", CASH_ID, "000000000006000-000000-device-b", {
      name: "Pantry cash",
      type: "cash",
      startingBalanceCents: 15_000,
    });

    it.each(
      permutations([groceries, editOnA, laterEditOnB]).map((order) => [
        order.map((e) => e.id),
        order,
      ])
    )("resolves concurrent edits to the later HLC, in the order %j", async (_ids, order) => {
      for (const event of order) {
        await receiveEvents([event], 0);
      }

      expect(await listAccounts()).toMatchObject([
        { id: CASH_ID, name: "Pantry cash", startingBalanceCents: 15_000 },
      ]);
    });

    it.each([
      ["the higher counter", "000000000005000-000001-device-a", "000000000005000-000002-device-a"],
      ["the later device id", "000000000005000-000003-device-a", "000000000005000-000003-device-b"],
    ])("breaks an equal wall time by %s", async (_rule, earlierHlc, laterHlc) => {
      const earlier = accountEdited("e-earlier", CASH_ID, earlierHlc, {
        name: "Earlier",
        type: "cash",
        startingBalanceCents: 0,
      });
      const later = accountEdited("e-later", CASH_ID, laterHlc, {
        name: "Later",
        type: "cash",
        startingBalanceCents: 0,
      });

      for (const order of [
        [groceries, later, earlier],
        [earlier, later, groceries],
      ]) {
        await resetLocalDatabase();
        for (const event of order) await receiveEvents([event], 0);

        expect(await listAccounts()).toMatchObject([{ name: "Later" }]);
      }
    });

    it.each([
      ["a Personal edit of a Household account", { visibility: "personal", ownerUserId: "user-a" }],
      ["an edit keyed to another owner", { visibility: "household", ownerUserId: "user-a" }],
    ] as const)("ignores %s", async (_case, envelope) => {
      const mismatched = { ...laterEditOnB, ...envelope };

      await receiveEvents([groceries, mismatched], 0);

      expect(await listAccounts()).toMatchObject([
        { name: "Groceries cash", visibility: "household", ownerUserId: null },
      ]);
    });

    it("applies an edit that arrives before its create once the create arrives", async () => {
      await receiveEvents([laterEditOnB], 0);
      expect(await listAccounts()).toHaveLength(0);

      await receiveEvents([groceries], 0);

      expect(await listAccounts()).toMatchObject([{ id: CASH_ID, name: "Pantry cash" }]);
    });
  });

  describe("retirement", () => {
    const retired = accountRetirement(
      "account.retired",
      "e-retire",
      "000000000005000-000000-device-a"
    );
    const unretired = accountRetirement(
      "account.unretired",
      "e-unretire",
      "000000000006000-000000-device-b"
    );
    const renamed = accountEdited("e-rename", CASH_ID, "000000000007000-000000-device-a", {
      name: "Coins",
      type: "cash",
      startingBalanceCents: 50_000,
    });

    it("moves a retired account from the main list to the retired list", async () => {
      await receiveEvents([cash, bank, retired], 0);

      expect(await listAccounts()).toMatchObject([{ id: BANK_ID }]);
      expect(await listRetiredAccounts()).toMatchObject([{ id: CASH_ID, name: "Cash" }]);
    });

    it.each(
      permutations([cash, retired, unretired, renamed]).map((order) => [
        order.map((e) => e.id),
        order,
      ])
    )(
      "follows the later of retire and unretire, and keeps a concurrent rename, in the order %j",
      async (_ids, order) => {
        for (const event of order) {
          await receiveEvents([event], 0);
        }

        expect(await listAccounts()).toMatchObject([{ id: CASH_ID, name: "Coins" }]);
        expect(await listRetiredAccounts()).toHaveLength(0);
      }
    );

    it("keeps an account retired when the retire is later than a rename", async () => {
      const laterRetire = { ...retired, hlc: "000000000008000-000000-device-a" };

      await receiveEvents([renamed, laterRetire, cash], 0);

      expect(await listRetiredAccounts()).toMatchObject([{ id: CASH_ID, name: "Coins" }]);
    });
  });

  describe("older event versions", () => {
    it("projects a version 1 create, which had no paying account", async () => {
      const versionOne: LoggedEvent = {
        ...cash,
        eventVersion: 1,
        payload: { name: "Cash", type: "cash", startingBalanceCents: 50_000 },
      };

      await receiveEvents([versionOne], 0);

      expect(await listAccounts()).toMatchObject([
        { id: CASH_ID, name: "Cash", startingBalanceCents: 50_000, payingAccountId: null },
      ]);
    });

    it("keeps a create from a newer version without projecting it", async () => {
      await receiveEvents([{ ...cash, eventVersion: 3 }], 0);

      expect(await listAccounts()).toHaveLength(0);
    });

    it("skips a create that gives a paying account to an account that isn't a credit card", async () => {
      const withPayingAccount = { ...cash, payload: { ...cash.payload, payingAccountId: BANK_ID } };

      await receiveEvents([withPayingAccount], 0);

      expect(await listAccounts()).toHaveLength(0);
    });
  });

  it("keeps an event of a type this version doesn't know without projecting it", async () => {
    const fromNewerApp = { ...bank, id: "e-future", eventType: "account.renamed" };

    await expect(receiveEvents([fromNewerApp], 0)).resolves.toBeUndefined();
    expect(await listAccounts()).toHaveLength(0);
  });
});
