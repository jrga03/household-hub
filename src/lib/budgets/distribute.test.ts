import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP, sumCents, type Cents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount, retireAccount } from "@/lib/commands/accounts";
import { setBudget } from "@/lib/commands/budgets";
import { createCategory, createGroup, retireCategory } from "@/lib/commands/categories";
import { distributeMoney } from "@/lib/commands/distribute";
import { addPayday, retirePayday } from "@/lib/commands/paydays";
import { readDistributeLines, readPaydayChoices, summarizeByAccount } from "./distribute";
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

const inPortions = (
  categoryId: string,
  accountId: string,
  portions: [paydayId: string, amount: string][]
) =>
  setBudget(MEMBER, {
    categoryId,
    fromMonth: "2026-10",
    amountCents: sumCents(portions.map(([, amount]) => peso(amount))),
    accountId,
    portions: portions.map(([paydayId, amount]) => ({ paydayId, amountCents: peso(amount) })),
  });

const fund = (categoryId: string, amount: string) =>
  distributeMoney(MEMBER, {
    sourceAccountId: bpi,
    date: "2026-10-15",
    lines: [{ categoryId, accountId: bpi, amountCents: peso(amount) }],
  });

const prefills = async (paydayIds: string[]) =>
  (await readDistributeLines(bpi, "2026-10", "income", paydayIds)).map((line) => [
    line.categoryId,
    line.amountCents,
  ]);

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

describe("readDistributeLines for paydays", () => {
  let fifteenth: string;
  let thirtieth: string;

  beforeEach(async () => {
    fifteenth = (await addPayday(MEMBER, "15th salary")).id;
    thirtieth = (await addPayday(MEMBER, "30th salary")).id;
  });

  it("asks only for the chosen payday's portions", async () => {
    await inPortions(groceries, bpi, [
      [fifteenth, "4000"],
      [thirtieth, "4000"],
    ]);
    await inPortions(utilities, bpi, [[thirtieth, "6000"]]);

    expect(await prefills([fifteenth])).toEqual([[groceries, 400000]]);
  });

  it("sums the portions on several paydays", async () => {
    await inPortions(groceries, bpi, [
      [fifteenth, "4000"],
      [thirtieth, "4000"],
    ]);
    await inPortions(utilities, bpi, [[thirtieth, "6000"]]);

    expect(await prefills([fifteenth, thirtieth])).toEqual([
      [utilities, 600000],
      [groceries, 800000],
    ]);
  });

  it("asks for what is left of the budget when that is less than the portion", async () => {
    await inPortions(groceries, bpi, [
      [fifteenth, "4000"],
      [thirtieth, "4000"],
    ]);
    await fund(groceries, "5000");

    expect(await prefills([thirtieth])).toEqual([[groceries, 300000]]);
  });

  it("still asks for the earlier payday's full portion after a later payday went first", async () => {
    await inPortions(groceries, bpi, [
      [fifteenth, "3000"],
      [thirtieth, "5000"],
    ]);
    await fund(groceries, "5000");

    expect(await prefills([fifteenth])).toEqual([[groceries, 300000]]);
  });

  it("prefills zero for a fully funded budget", async () => {
    await inPortions(groceries, bpi, [
      [fifteenth, "4000"],
      [thirtieth, "4000"],
    ]);
    await fund(groceries, "8000");

    expect(await prefills([thirtieth])).toEqual([[groceries, 0]]);
  });

  it("always includes budgets any payday pays, with what is left of them", async () => {
    await budget(transportation, "3000", gcash);
    await inPortions(groceries, bpi, [[fifteenth, "8000"]]);
    await fund(transportation, "1000");

    expect(await prefills([thirtieth])).toEqual([[transportation, 200000]]);
    expect(await prefills([])).toEqual([[transportation, 200000]]);
  });
});

describe("readPaydayChoices", () => {
  it("offers a retired payday only while a budget in force names it", async () => {
    const fifteenth = (await addPayday(MEMBER, "15th salary")).id;
    const bonus = (await addPayday(MEMBER, "Bonus")).id;
    const unused = (await addPayday(MEMBER, "Unused")).id;
    await inPortions(groceries, bpi, [[bonus, "8000"]]);
    await setBudget(MEMBER, {
      categoryId: groceries,
      fromMonth: "2026-11",
      amountCents: peso("8000"),
      accountId: bpi,
      portions: [{ paydayId: fifteenth, amountCents: peso("8000") }],
    });
    await retirePayday(MEMBER, bonus, "2026-11");
    await retirePayday(MEMBER, unused, "2026-11");

    const chips = async (month: string) =>
      (await readPaydayChoices(bpi, month)).paydays.map((payday) => payday.name);
    expect(await chips("2026-10")).toEqual(["15th salary", "Bonus"]);
    expect(await chips("2026-11")).toEqual(["15th salary"]);
  });
});

describe("summarizeByAccount", () => {
  it("sums lines per destination account, keeps the source last, and leaves out zero totals", () => {
    const lines = [
      { accountId: "bpi", amountCents: peso("6000") },
      { accountId: "gcash", amountCents: peso("3000") },
      { accountId: "bdo", amountCents: null },
      { accountId: "bpi", amountCents: peso("8000") },
      { accountId: "maya", amountCents: peso("1500") },
      { accountId: "gcash", amountCents: peso("500") },
      { accountId: "bdo", amountCents: peso("0") },
    ];

    expect(summarizeByAccount(lines, "bpi")).toEqual([
      { accountId: "gcash", amountCents: 350000 },
      { accountId: "maya", amountCents: 150000 },
      { accountId: "bpi", amountCents: 1400000 },
    ]);
  });

  it("leaves out the source row when nothing stays in it", () => {
    expect(summarizeByAccount([{ accountId: "gcash", amountCents: peso("200") }], "bpi")).toEqual([
      { accountId: "gcash", amountCents: 20000 },
    ]);
  });
});
