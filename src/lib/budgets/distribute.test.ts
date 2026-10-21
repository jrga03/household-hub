import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP, type Cents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount, retireAccount } from "@/lib/commands/accounts";
import { setBudget } from "@/lib/commands/budgets";
import { createCategory, createGroup, retireCategory } from "@/lib/commands/categories";
import { readDistributeLines } from "./distribute";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

const peso = (amount: string): Cents => parsePHP(amount);

const account = (name: string) =>
  createAccount(MEMBER, { name, type: "bank", startingBalanceCents: peso("0") });

let bpi: string;
let gcash: string;
let groceries: string;
let transportation: string;
let utilities: string;

const budget = (categoryId: string, amount: string, accountId: string) =>
  setBudget(MEMBER, {
    categoryId,
    fromMonth: "2026-10",
    amountCents: peso(amount),
    accountId,
  });

beforeEach(async () => {
  await resetLocalDatabase();
  bpi = (await account("BPI")).id;
  gcash = (await account("GCash")).id;
  const bills = await createGroup(MEMBER, { name: "Bills" });
  const food = await createGroup(MEMBER, { name: "Food" });
  const gettingAround = await createGroup(MEMBER, { name: "Getting Around" });
  groceries = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
  transportation = (
    await createCategory(MEMBER, { name: "Transportation", groupId: gettingAround.id })
  ).id;
  utilities = (await createCategory(MEMBER, { name: "Utilities", groupId: bills.id })).id;
});

describe("readDistributeLines", () => {
  it("prefills each budget in force into its funding account (the issue's demo)", async () => {
    await budget(groceries, "8000", bpi);
    await budget(transportation, "3000", gcash);
    await budget(utilities, "6000", bpi);

    expect(await readDistributeLines(bpi, "2026-10", "income")).toEqual([
      expect.objectContaining({ categoryId: utilities, accountId: bpi, amountCents: 600000 }),
      expect.objectContaining({ categoryId: groceries, accountId: bpi, amountCents: 800000 }),
      expect.objectContaining({
        categoryId: transportation,
        accountId: gcash,
        amountCents: 300000,
      }),
    ]);
  });

  it("skips retired categories", async () => {
    await budget(groceries, "8000", bpi);
    await budget(utilities, "6000", bpi);
    await retireCategory(MEMBER, utilities);

    const lines = await readDistributeLines(bpi, "2026-10", "income");
    expect(lines.map((line) => line.categoryId)).toEqual([groceries]);
  });

  it("falls back to the source when the funding account is retired", async () => {
    await budget(transportation, "3000", gcash);
    await retireAccount(MEMBER, gcash);

    expect(await readDistributeLines(bpi, "2026-10", "income")).toEqual([
      {
        categoryId: transportation,
        accountId: bpi,
        amountCents: 300000,
        budgetCents: 300000,
        fundingAccountRetired: true,
      },
    ]);
  });

  it("leaves out categories the source can't hold", async () => {
    const mine = await createGroup(MEMBER, { name: "Mine", visibility: "personal" });
    const travel = (await createCategory(MEMBER, { name: "Travel", groupId: mine.id })).id;
    const wallet = (
      await createAccount(MEMBER, {
        name: "Wallet",
        type: "cash",
        startingBalanceCents: peso("0"),
        visibility: "personal",
      })
    ).id;
    await budget(travel, "2000", wallet);
    await budget(groceries, "8000", bpi);

    const lines = await readDistributeLines(bpi, "2026-10", "income");
    expect(lines.map((line) => line.categoryId)).toEqual([groceries]);
  });

  it("opens every category in use blank, kept in the source, in opening mode", async () => {
    await budget(transportation, "3000", gcash);

    expect(await readDistributeLines(bpi, "2026-10", "opening")).toEqual([
      expect.objectContaining({ categoryId: utilities, accountId: bpi, amountCents: null }),
      expect.objectContaining({ categoryId: groceries, accountId: bpi, amountCents: null }),
      {
        categoryId: transportation,
        accountId: bpi,
        amountCents: null,
        budgetCents: 300000,
        fundingAccountRetired: false,
      },
    ]);
  });
});
