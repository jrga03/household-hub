import { beforeEach, describe, expect, it } from "vitest";
import type { Cents } from "@/lib/currency";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed } from "@/lib/events/log";
import { listTransactions } from "@/lib/transactions/projection";
import { createAccount, retireAccount } from "./accounts";
import { createCategory, createGroup, retireCategory } from "./categories";
import {
  addTransaction,
  editTransaction,
  removeTransaction,
  restoreTransaction,
  setTransactionStatus,
  type TransactionInput,
} from "./transactions";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const OTHER_MEMBER = { householdId: HOUSEHOLD, userId: "user-b" };

const peso = (amount: string): Cents => parsePHP(amount);

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
    await retireCategory(MEMBER, groceriesId);
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
