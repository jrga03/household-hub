import { beforeEach, describe, expect, it } from "vitest";
import type { Cents } from "@/lib/currency";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed, receiveEvents, type LoggedEvent } from "@/lib/events/log";
import { listTransactions } from "@/lib/transactions/projection";
import { createAccount, editAccount, retireAccount } from "./accounts";
import { createCategory, createGroup, retireCategory } from "./categories";
import {
  addTransaction,
  changeTransactionsCategory,
  editTransaction,
  removeTransaction,
  removeTransactions,
  restoreTransaction,
  restoreTransactions,
  setTransactionStatus,
  type TransactionInput,
} from "./transactions";
import { retireOnAnotherDevice } from "@/test/anotherDevice";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const OTHER_MEMBER = { householdId: HOUSEHOLD, userId: "user-b" };

const peso = (amount: string): Cents => parsePHP(amount);

const DESCRIPTION_REQUIRED = "Add a description.";
const OLD_ID = "dddddddd-0000-4000-8000-000000000001";

/** A transaction another device recorded before descriptions were required. */
function oldEventWithoutDescription(details: Record<string, unknown> = {}): LoggedEvent {
  return {
    id: "old-created",
    householdId: HOUSEHOLD,
    visibility: "household",
    ownerUserId: null,
    entityType: "transaction",
    entityId: OLD_ID,
    eventType: "transaction.created",
    eventVersion: 3,
    hlc: "000000000001000-000000-device-b",
    deviceId: "device-b",
    actorUserId: "user-b",
    payload: {
      ...expense({ description: "" }),
      payingAccountId: null,
      importKey: null,
      status: "cleared",
      ...details,
    },
  };
}

let bankId: string;
let groceriesId: string;

const expense = (overrides: Partial<TransactionInput> = {}): TransactionInput => ({
  date: "2026-10-12",
  type: "expense",
  amountCents: peso("250"),
  accountId: bankId,
  categoryId: groceriesId,
  description: "Market",
  notes: "",
  ...overrides,
});

async function personalCategory(actor: typeof MEMBER) {
  const group = await createGroup(actor, { name: "Mine", visibility: "personal" });
  return (await createCategory(actor, { name: "Travel", groupId: group.id })).id;
}

beforeEach(async () => {
  await resetLocalDatabase();
  bankId = (
    await createAccount(MEMBER, { name: "Bank", type: "bank", startingBalanceCents: peso("1000") })
  ).id;
  const food = await createGroup(MEMBER, { name: "Food" });
  groceriesId = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
});

describe("addTransaction", () => {
  it("records a cleared transaction seen by the same people as its account", async () => {
    const { id } = await addTransaction(MEMBER, expense());

    expect(await listTransactions()).toMatchObject([
      {
        id,
        amountCents: 25000,
        categoryId: groceriesId,
        status: "cleared",
        visibility: "household",
      },
    ]);
    const [event] = (await listUnpushed(100)).filter((logged) => logged.entityId === id);
    expect(event).toMatchObject({
      eventType: "transaction.created",
      visibility: "household",
      ownerUserId: null,
    });
  });

  it("records a pending transaction when the member says so", async () => {
    await addTransaction(MEMBER, { ...expense(), status: "pending" });

    expect(await listTransactions()).toMatchObject([{ status: "pending" }]);
  });

  it("records income in Unassigned when no category is named", async () => {
    await addTransaction(MEMBER, expense({ type: "income", categoryId: null }));

    expect(await listTransactions()).toMatchObject([{ type: "income", categoryId: null }]);
  });

  it("refuses a retired account", async () => {
    await retireAccount(MEMBER, bankId);

    await expect(addTransaction(MEMBER, expense())).rejects.toThrow("Bank is retired.");
  });

  it("refuses a retired category", async () => {
    await retireCategory(MEMBER, groceriesId);

    await expect(addTransaction(MEMBER, expense())).rejects.toThrow("Groceries is retired.");
  });

  it("refuses a category of another visibility", async () => {
    const travelId = await personalCategory(MEMBER);

    await expect(addTransaction(MEMBER, expense({ categoryId: travelId }))).rejects.toThrow(
      "Choose a Household category for Bank."
    );
  });

  it("refuses a Personal category of another owner", async () => {
    const wallet = await createAccount(MEMBER, {
      name: "My wallet",
      type: "cash",
      startingBalanceCents: peso("0"),
      visibility: "personal",
    });
    const theirs = await personalCategory(OTHER_MEMBER);

    await expect(
      addTransaction(MEMBER, expense({ accountId: wallet.id, categoryId: theirs }))
    ).rejects.toThrow("Choose a Personal category for My wallet.");
    const mine = await personalCategory(MEMBER);
    await addTransaction(MEMBER, expense({ accountId: wallet.id, categoryId: mine }));
    expect(await listTransactions()).toMatchObject([
      { visibility: "personal", ownerUserId: "user-a" },
    ]);
  });

  it("refuses an amount of zero", async () => {
    await expect(addTransaction(MEMBER, expense({ amountCents: peso("0") }))).rejects.toThrow(
      "The amount must be more than zero"
    );
  });

  it("refuses a missing or blank description", async () => {
    await expect(addTransaction(MEMBER, expense({ description: "   " }))).rejects.toThrow(
      DESCRIPTION_REQUIRED
    );
    await expect(addTransaction(MEMBER, expense({ description: undefined }))).rejects.toThrow(
      DESCRIPTION_REQUIRED
    );
    expect(await listTransactions()).toEqual([]);
  });

  it("refuses an imported statement line without a description too", async () => {
    await expect(
      addTransaction(MEMBER, { ...expense({ description: "" }), importKey: "statement-line-1" })
    ).rejects.toThrow(DESCRIPTION_REQUIRED);
  });
});

describe("editTransaction", () => {
  it("moves a transaction to another account of the same visibility", async () => {
    const { id } = await addTransaction(MEMBER, expense());
    const wallet = await createAccount(MEMBER, {
      name: "Wallet",
      type: "cash",
      startingBalanceCents: peso("0"),
    });

    await editTransaction(MEMBER, id, expense({ accountId: wallet.id, amountCents: peso("275") }));

    expect(await listTransactions()).toMatchObject([{ accountId: wallet.id, amountCents: 27500 }]);
  });

  it("refuses an account of another visibility", async () => {
    const { id } = await addTransaction(MEMBER, expense());
    const mine = await createAccount(MEMBER, {
      name: "My wallet",
      type: "cash",
      startingBalanceCents: peso("0"),
      visibility: "personal",
    });

    await expect(
      editTransaction(MEMBER, id, expense({ accountId: mine.id, categoryId: null }))
    ).rejects.toThrow(
      "Choose a Household account. To move it to a Personal one, remove it and add it there."
    );
  });

  it("appends nothing when the details are unchanged, so another device's edit isn't overwritten", async () => {
    const { id } = await addTransaction(MEMBER, expense());
    const before = await listUnpushed(100);

    await editTransaction(MEMBER, id, expense({ description: "  Market  " }));

    expect(await listUnpushed(100)).toHaveLength(before.length);
  });

  it("refuses clearing the description", async () => {
    const { id } = await addTransaction(MEMBER, expense());

    await expect(editTransaction(MEMBER, id, expense({ description: "" }))).rejects.toThrow(
      DESCRIPTION_REQUIRED
    );
    await expect(editTransaction(MEMBER, id, expense({ description: "   " }))).rejects.toThrow(
      DESCRIPTION_REQUIRED
    );
  });

  it("asks for a description when editing an old transaction that has none", async () => {
    await receiveEvents([oldEventWithoutDescription()], 0);

    await expect(
      editTransaction(MEMBER, OLD_ID, expense({ description: "", amountCents: peso("300") }))
    ).rejects.toThrow(DESCRIPTION_REQUIRED);
    await editTransaction(MEMBER, OLD_ID, expense({ description: "Lunch" }));

    expect(await listTransactions()).toMatchObject([{ id: OLD_ID, description: "Lunch" }]);
  });

  it("refuses moving a transaction into a retired category", async () => {
    const { id } = await addTransaction(MEMBER, expense({ categoryId: null }));
    await retireCategory(MEMBER, groceriesId);

    await expect(editTransaction(MEMBER, id, expense())).rejects.toThrow("Groceries is retired.");
  });

  it("refuses a category of another visibility", async () => {
    const { id } = await addTransaction(MEMBER, expense());
    const travelId = await personalCategory(MEMBER);

    await expect(editTransaction(MEMBER, id, expense({ categoryId: travelId }))).rejects.toThrow(
      "Choose a Household category for Bank."
    );
  });

  it("keeps a transaction on a retired account or category editable", async () => {
    const { id } = await addTransaction(MEMBER, expense());
    await retireOnAnotherDevice(MEMBER, groceriesId);
    await retireAccount(MEMBER, bankId);

    await editTransaction(MEMBER, id, expense({ description: "Wet market" }));

    expect(await listTransactions()).toMatchObject([{ description: "Wet market" }]);
  });

  it("refuses moving a transaction onto a retired account", async () => {
    const { id } = await addTransaction(MEMBER, expense());
    const old = await createAccount(MEMBER, {
      name: "Old bank",
      type: "bank",
      startingBalanceCents: peso("0"),
    });
    await retireAccount(MEMBER, old.id);

    await expect(editTransaction(MEMBER, id, expense({ accountId: old.id }))).rejects.toThrow(
      "Old bank is retired."
    );
  });
});

describe("the Paying Account of a card transaction", () => {
  let walletId: string;
  let cardId: string;

  beforeEach(async () => {
    walletId = (
      await createAccount(MEMBER, { name: "Wallet", type: "cash", startingBalanceCents: peso("0") })
    ).id;
    cardId = (
      await createAccount(MEMBER, {
        name: "Visa",
        type: "credit_card",
        startingBalanceCents: peso("0"),
        payingAccountId: bankId,
      })
    ).id;
  });

  const payTheCardFromWallet = () =>
    editAccount(MEMBER, cardId, {
      name: "Visa",
      type: "credit_card",
      startingBalanceCents: peso("0"),
      payingAccountId: walletId,
    });

  it("records the card's Paying Account, and keeps it when the card's default changes", async () => {
    const { id } = await addTransaction(MEMBER, expense({ accountId: cardId }));
    await payTheCardFromWallet();

    await editTransaction(MEMBER, id, expense({ accountId: cardId, description: "Lunch" }));

    expect(await listTransactions()).toMatchObject([
      { description: "Lunch", payingAccountId: bankId },
    ]);
  });

  it("records none for a transaction on an account that isn't a card", async () => {
    await addTransaction(MEMBER, expense());

    expect(await listTransactions()).toMatchObject([{ payingAccountId: null }]);
  });

  it("re-records it when a transaction moves onto a card, and clears it when it moves off", async () => {
    const { id } = await addTransaction(MEMBER, expense());
    await payTheCardFromWallet();

    await editTransaction(MEMBER, id, expense({ accountId: cardId }));
    expect(await listTransactions()).toMatchObject([{ payingAccountId: walletId }]);

    await editTransaction(MEMBER, id, expense({ accountId: walletId }));
    expect(await listTransactions()).toMatchObject([{ payingAccountId: null }]);
  });

  it("appends nothing for an unchanged card transaction after the card's default changes", async () => {
    const { id } = await addTransaction(MEMBER, expense({ accountId: cardId }));
    await payTheCardFromWallet();
    const before = await listUnpushed(100);

    await editTransaction(MEMBER, id, expense({ accountId: cardId }));

    expect(await listUnpushed(100)).toHaveLength(before.length);
  });
});

describe("status and removal", () => {
  it("marks a transaction pending and cleared again", async () => {
    const { id } = await addTransaction(MEMBER, expense());

    await setTransactionStatus(MEMBER, id, "pending");
    expect(await listTransactions()).toMatchObject([{ status: "pending" }]);
    await setTransactionStatus(MEMBER, id, "cleared");
    expect(await listTransactions()).toMatchObject([{ status: "cleared" }]);
  });

  it("removes a transaction and restores it with its details", async () => {
    const { id } = await addTransaction(MEMBER, expense());

    await removeTransaction(MEMBER, id);
    expect(await listTransactions()).toEqual([]);
    await restoreTransaction(MEMBER, id);
    expect(await listTransactions()).toMatchObject([{ id, description: "Market" }]);
  });
});

describe("bulk actions", () => {
  const eventsOf = async (eventType: string) =>
    (await listUnpushed(1000)).filter((logged) => logged.eventType === eventType);

  it("moves each transaction into the category, skipping ones there and reporting refusals", async () => {
    const { id: market } = await addTransaction(MEMBER, expense({ categoryId: null }));
    const { id: bakery } = await addTransaction(MEMBER, expense({ description: "Bakery" }));
    const travelId = await personalCategory(MEMBER);
    const { id: personal } = await createAccount(MEMBER, {
      name: "Wallet",
      type: "cash",
      visibility: "personal",
      startingBalanceCents: peso("0"),
    });
    const { id: trip } = await addTransaction(
      MEMBER,
      expense({ accountId: personal, categoryId: travelId, description: "Trip" })
    );
    const before = await eventsOf("transaction.edited");

    const result = await changeTransactionsCategory(MEMBER, [market, bakery, trip], groceriesId);

    expect(result.changed).toEqual([market]);
    expect(result.failed).toEqual([{ id: trip, reason: "Choose a Personal category for Wallet." }]);
    expect(await eventsOf("transaction.edited")).toHaveLength(before.length + 1);
    const byId = new Map((await listTransactions()).map((row) => [row.id, row]));
    expect(byId.get(market)).toMatchObject({ categoryId: groceriesId, description: "Market" });
    expect(byId.get(trip)).toMatchObject({ categoryId: travelId });
  });

  it("moves an old transaction without a description into a category", async () => {
    await receiveEvents([oldEventWithoutDescription({ categoryId: null })], 0);

    const result = await changeTransactionsCategory(MEMBER, [OLD_ID], groceriesId);

    expect(result).toEqual({ changed: [OLD_ID], failed: [] });
    expect(await listTransactions()).toMatchObject([
      { id: OLD_ID, categoryId: groceriesId, description: "" },
    ]);
  });

  it("removes several transactions and restores them all", async () => {
    const ids = await Promise.all(
      ["Market", "Bakery"].map(
        async (description) => (await addTransaction(MEMBER, expense({ description }))).id
      )
    );
    const { id: kept } = await addTransaction(MEMBER, expense({ description: "Dinner" }));

    expect(await removeTransactions(MEMBER, ids)).toEqual({ changed: ids, failed: [] });
    expect((await listTransactions()).map((row) => row.id)).toEqual([kept]);

    expect(await restoreTransactions(MEMBER, ids)).toEqual({ changed: ids, failed: [] });
    expect(await listTransactions()).toHaveLength(3);
    expect(await eventsOf("transaction.removed")).toHaveLength(2);
    expect(await eventsOf("transaction.restored")).toHaveLength(2);
  });
});
