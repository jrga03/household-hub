import { beforeEach, describe, expect, it } from "vitest";
import { permutations } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents, type LoggedEvent } from "@/lib/events/log";
import { hlcAt, loggedEvent, type EventFields } from "@/test/events";
import { listAccounts, listRetiredAccounts } from "./projection";

const CASH_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const BANK_ID = "aaaaaaaa-0000-4000-8000-000000000002";

type AccountEventFields = Omit<EventFields, "entityType" | "eventType">;

function accountCreated(fields: AccountEventFields): LoggedEvent {
  return loggedEvent({
    eventVersion: 2,
    ...fields,
    entityType: "account",
    eventType: "account.created",
    payload: { payingAccountId: null, ...fields.payload },
  });
}

function accountEdited(fields: AccountEventFields): LoggedEvent {
  return { ...accountCreated(fields), eventType: "account.edited" };
}

function accountRetirement(
  eventType: "account.retired" | "account.unretired",
  fields: Omit<AccountEventFields, "entityId" | "payload">
): LoggedEvent {
  return loggedEvent({ ...fields, entityType: "account", entityId: CASH_ID, eventType });
}

const cash = accountCreated({
  id: "e-cash",
  entityId: CASH_ID,
  millis: 1000,
  payload: {
    name: "Cash",
    type: "cash",
    startingBalanceCents: 50_000,
  },
});
const bank = accountCreated({
  id: "e-bank",
  entityId: BANK_ID,
  millis: 2000,
  payload: {
    name: "BDO Savings",
    type: "bank",
    startingBalanceCents: 1_250_075,
  },
});
// The same account created twice (never expected, but projections must stay
// deterministic): the later HLC wins.
const cashAgainLater = accountCreated({
  id: "e-cash-2",
  entityId: CASH_ID,
  millis: 3000,
  device: "device-a",
  payload: {
    name: "Wallet",
    type: "cash",
    startingBalanceCents: 70_000,
  },
});

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
    const broken = accountCreated({
      id: "e-broken",
      entityId: "aaaaaaaa-0000-4000-8000-000000000009",
      millis: 1000,
      payload: {
        name: "",
        type: "cash",
        startingBalanceCents: 1.5,
      },
    });

    await receiveEvents([broken, bank], 0);

    expect(await listAccounts()).toMatchObject([{ id: BANK_ID }]);
  });

  const personalSavings: LoggedEvent = {
    ...accountCreated({
      id: "e-savings",
      entityId: BANK_ID,
      millis: 1000,
      payload: {
        name: "Savings",
        type: "bank",
        startingBalanceCents: 0,
      },
    }),
    visibility: "personal",
    ownerUserId: "user-b",
  };
  const savingsRenamedByOwner: LoggedEvent = {
    ...accountEdited({
      id: "e-savings-2",
      entityId: BANK_ID,
      millis: 2000,
      payload: {
        name: "Rainy day",
        type: "bank",
        startingBalanceCents: 0,
      },
    }),
    visibility: "personal",
    ownerUserId: "user-b",
  };
  const savingsMadeHousehold = accountEdited({
    id: "e-savings-3",
    entityId: BANK_ID,
    millis: 3000,
    device: "device-a",
    payload: { name: "Joint savings", type: "bank", startingBalanceCents: 0 },
  });

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
    const groceries = accountCreated({
      id: "e-groceries",
      entityId: CASH_ID,
      millis: 1000,
      device: "device-a",
      payload: {
        name: "Groceries cash",
        type: "cash",
        startingBalanceCents: 10_000,
      },
    });
    const editOnA = accountEdited({
      id: "e-edit-a",
      entityId: CASH_ID,
      millis: 5000,
      device: "device-a",
      payload: {
        name: "Market cash",
        type: "cash",
        startingBalanceCents: 12_000,
      },
    });
    const laterEditOnB = accountEdited({
      id: "e-edit-b",
      entityId: CASH_ID,
      millis: 6000,
      payload: {
        name: "Pantry cash",
        type: "cash",
        startingBalanceCents: 15_000,
      },
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
      [
        "the higher counter",
        { millis: 5000, device: "device-a", counter: 1 },
        { millis: 5000, device: "device-a", counter: 2 },
      ],
      [
        "the later device id",
        { millis: 5000, device: "device-a", counter: 3 },
        { millis: 5000, counter: 3 },
      ],
    ])("breaks an equal wall time by %s", async (_rule, earlierAt, laterAt) => {
      const earlier = accountEdited({
        id: "e-earlier",
        entityId: CASH_ID,
        ...earlierAt,
        payload: {
          name: "Earlier",
          type: "cash",
          startingBalanceCents: 0,
        },
      });
      const later = accountEdited({
        id: "e-later",
        entityId: CASH_ID,
        ...laterAt,
        payload: {
          name: "Later",
          type: "cash",
          startingBalanceCents: 0,
        },
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
    const retired = accountRetirement("account.retired", {
      id: "e-retire",
      millis: 5000,
      device: "device-a",
    });
    const unretired = accountRetirement("account.unretired", { id: "e-unretire", millis: 6000 });
    const renamed = accountEdited({
      id: "e-rename",
      entityId: CASH_ID,
      millis: 7000,
      device: "device-a",
      payload: {
        name: "Coins",
        type: "cash",
        startingBalanceCents: 50_000,
      },
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
      const laterRetire = { ...retired, hlc: hlcAt(8000, "device-a") };

      await receiveEvents([renamed, laterRetire, cash], 0);

      expect(await listRetiredAccounts()).toMatchObject([{ id: CASH_ID, name: "Coins" }]);
    });
  });

  describe("credit cards", () => {
    const VISA_ID = "aaaaaaaa-0000-4000-8000-000000000003";
    const visa = accountCreated({
      id: "e-visa",
      entityId: VISA_ID,
      millis: 4000,
      device: "device-a",
      payload: {
        name: "Visa",
        type: "credit_card",
        startingBalanceCents: 0,
        payingAccountId: BANK_ID,
      },
    });

    it("resolves a card's Paying Account once that account arrives", async () => {
      await receiveEvents([visa], 0);
      expect(await listAccounts()).toMatchObject([
        { id: VISA_ID, payingAccountId: BANK_ID, payingAccount: null },
      ]);

      await receiveEvents([bank], 0);

      expect(await listAccounts()).toMatchObject([
        { id: BANK_ID, payingAccount: null },
        { id: VISA_ID, payingAccount: { id: BANK_ID, name: "BDO Savings" } },
      ]);
    });

    it("still names a Paying Account that has since been retired", async () => {
      const bankRetired = {
        ...accountRetirement("account.retired", { id: "e-bank-retired", millis: 5000 }),
        entityId: BANK_ID,
      };

      await receiveEvents([visa, bank, bankRetired], 0);

      expect(await listAccounts()).toMatchObject([
        { id: VISA_ID, payingAccount: { name: "BDO Savings", retired: true } },
      ]);
    });

    it("doesn't resolve a Paying Account of another visibility", async () => {
      const personalBank = { ...bank, visibility: "personal" as const, ownerUserId: "user-b" };

      await receiveEvents([visa, personalBank], 0);

      expect(await listAccounts()).toMatchObject([
        { id: BANK_ID },
        { id: VISA_ID, payingAccount: null },
      ]);
    });

    const payFromCash = accountEdited({
      id: "e-visa-cash",
      entityId: VISA_ID,
      millis: 6000,
      payload: {
        name: "Visa",
        type: "credit_card",
        startingBalanceCents: 0,
        payingAccountId: CASH_ID,
      },
    });

    it.each(
      permutations([visa, bank, cash, payFromCash]).map((order) => [order.map((e) => e.id), order])
    )("follows the later Paying Account edit, in the order %j", async (_ids, order) => {
      for (const event of order) {
        await receiveEvents([event], 0);
      }

      expect(await listAccounts()).toMatchObject([
        { id: BANK_ID },
        { id: CASH_ID },
        { id: VISA_ID, payingAccountId: CASH_ID, payingAccount: { id: CASH_ID } },
      ]);
    });

    it.each([
      [
        "a card edited into a bank account",
        visa,
        accountEdited({
          id: "e-visa-bank",
          entityId: VISA_ID,
          millis: 6000,
          payload: {
            name: "Not a card",
            type: "bank",
            startingBalanceCents: 0,
            payingAccountId: null,
          },
        }),
        { name: "Visa", type: "credit_card" },
      ],
      [
        "a bank account edited into a card",
        bank,
        accountEdited({
          id: "e-bank-card",
          entityId: BANK_ID,
          millis: 6000,
          payload: {
            name: "Now a card",
            type: "credit_card",
            startingBalanceCents: 0,
            payingAccountId: CASH_ID,
          },
        }),
        { name: "BDO Savings", type: "bank" },
      ],
    ])("ignores %s, in every order", async (_case, created, crossing, expected) => {
      for (const order of permutations([created, crossing])) {
        await resetLocalDatabase();
        for (const event of order) await receiveEvents([event], 0);

        expect(await listAccounts()).toMatchObject([expected]);
      }
    });

    it("doesn't resolve another card as a Paying Account", async () => {
      const otherCard = accountCreated({
        id: "e-other",
        entityId: BANK_ID,
        millis: 2000,
        payload: {
          name: "Mastercard",
          type: "credit_card",
          startingBalanceCents: 0,
          payingAccountId: CASH_ID,
        },
      });

      await receiveEvents([visa, otherCard], 0);

      expect(await listAccounts()).toMatchObject([
        { id: BANK_ID, name: "Mastercard" },
        { id: VISA_ID, payingAccount: null },
      ]);
    });

    it.each([
      ["without a Paying Account", { payingAccountId: null }],
      ["with an empty Paying Account", { payingAccountId: "" }],
      ["paying from itself", { payingAccountId: VISA_ID }],
    ])("skips a card created %s", async (_case, payload) => {
      await receiveEvents([{ ...visa, payload: { ...visa.payload, ...payload } }], 0);

      expect(await listAccounts()).toHaveLength(0);
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

    it("projects a version 1 edit, which had no paying account", async () => {
      const versionOneEdit: LoggedEvent = {
        ...accountEdited({
          id: "e-cash-edit",
          entityId: CASH_ID,
          millis: 2000,
          device: "device-a",
          payload: {
            name: "Coins",
            type: "cash",
            startingBalanceCents: 50_000,
          },
        }),
        eventVersion: 1,
      };

      await receiveEvents([cash, versionOneEdit], 0);

      expect(await listAccounts()).toMatchObject([
        { id: CASH_ID, name: "Coins", payingAccountId: null },
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
