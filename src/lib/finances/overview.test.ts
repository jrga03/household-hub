import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP, type Cents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount, retireAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { setBudget } from "@/lib/commands/budgets";
import { addTransaction, removeTransaction } from "@/lib/commands/transactions";
import { addTransfer } from "@/lib/commands/transfers";
import { readFinanceOverview, type FinanceView } from "./overview";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };
const OTHER_MEMBER = { ...MEMBER, userId: "user-b" };

const peso = (amount: string): Cents => parsePHP(amount);

const october = (view: FinanceView = "household") =>
  readFinanceOverview(view, MEMBER.userId, "2026-10");

let bpiId: string;
let gcashId: string;
let walletId: string;
let theirWalletId: string;
let groceriesId: string;

const record = (date: string, amount: string, type = "expense", accountId = bpiId) =>
  addTransaction(MEMBER, {
    date,
    type,
    amountCents: peso(amount),
    accountId,
    categoryId: groceriesId,
    description: "Test",
  });

const recordPersonal = (actor: typeof MEMBER, accountId: string, amount: string, type: string) =>
  addTransaction(actor, {
    date: "2026-10-15",
    type,
    amountCents: peso(amount),
    accountId,
    categoryId: null,
    description: "Test",
  });

beforeEach(async () => {
  await resetLocalDatabase();
  bpiId = (
    await createAccount(MEMBER, { name: "BPI", type: "bank", startingBalanceCents: peso("50000") })
  ).id;
  gcashId = (
    await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: peso("0"),
    })
  ).id;
  walletId = (
    await createAccount(MEMBER, {
      name: "Wallet",
      type: "cash",
      startingBalanceCents: peso("1000"),
      visibility: "personal",
    })
  ).id;
  theirWalletId = (
    await createAccount(OTHER_MEMBER, {
      name: "Their wallet",
      type: "cash",
      startingBalanceCents: peso("7000"),
      visibility: "personal",
    })
  ).id;
  const food = await createGroup(MEMBER, { name: "Food" });
  groceriesId = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
});

describe("this month's money", () => {
  it("sums money in and out dated this month, leaving transfers out", async () => {
    await record("2026-10-01", "30000", "income");
    await record("2026-10-05", "1200");
    await record("2026-10-20", "800");
    await record("2026-09-30", "999");
    await record("2026-11-01", "500");
    await addTransfer(MEMBER, {
      date: "2026-10-10",
      amountCents: peso("2000"),
      fromAccountId: bpiId,
      toAccountId: gcashId,
      envelope: { kind: "category", id: groceriesId },
    });

    expect(await october()).toMatchObject({ in: 3000000, out: 200000, left: 2800000 });
  });
});

describe("Household and Mine", () => {
  beforeEach(async () => {
    await record("2026-10-05", "1200");
    await recordPersonal(MEMBER, walletId, "5000", "income");
    await recordPersonal(MEMBER, walletId, "300", "expense");
    await recordPersonal(OTHER_MEMBER, theirWalletId, "400", "expense");
  });

  it("counts only Household accounts for Household", async () => {
    expect(await october("household")).toMatchObject({ in: 0, out: 120000, left: -120000 });
  });

  it("counts only the member's own Personal accounts for Mine", async () => {
    expect(await october("mine")).toMatchObject({ in: 500000, out: 30000, left: 470000 });
  });
});

describe("balances", () => {
  const balancesOf = async (view: FinanceView) =>
    (await october(view)).balances.map(({ account, balance }) => [account.name, balance]);

  it("shows each account in use with its balance, Household and Mine apart", async () => {
    await record("2026-10-05", "1200");
    await recordPersonal(MEMBER, walletId, "300", "expense");
    const retiredId = (
      await createAccount(MEMBER, { name: "Old", type: "cash", startingBalanceCents: peso("5") })
    ).id;
    await retireAccount(MEMBER, retiredId);

    expect(await balancesOf("household")).toEqual([
      ["BPI", 4880000],
      ["GCash", 0],
    ]);
    expect(await balancesOf("mine")).toEqual([["Wallet", 70000]]);
  });
});

describe("budget status", () => {
  async function budgetedCategory(spent: string, { personal = false } = {}) {
    const actorAccountId = personal ? walletId : bpiId;
    const group = await createGroup(MEMBER, {
      name: `Group ${spent}`,
      visibility: personal ? "personal" : "household",
    });
    const { id } = await createCategory(MEMBER, { name: `Spent ${spent}`, groupId: group.id });
    await setBudget(MEMBER, {
      categoryId: id,
      fromMonth: "2026-09",
      amountCents: peso("1000"),
      accountId: actorAccountId,
    });
    await addTransaction(MEMBER, {
      date: "2026-10-12",
      type: "expense",
      amountCents: peso(spent),
      accountId: actorAccountId,
      categoryId: id,
      description: "Test",
    });
  }

  it("is fine below 80% spent, close from 80% to 100%, over above 100%", async () => {
    await budgetedCategory("799.99");
    await budgetedCategory("800");
    await budgetedCategory("1000");
    await budgetedCategory("1000.01");

    expect((await october()).budgets).toEqual({ fine: 1, close: 2, over: 1 });
  });

  it("counts Household and the member's Personal categories apart", async () => {
    await budgetedCategory("100");
    await budgetedCategory("2000", { personal: true });

    expect((await october("household")).budgets).toEqual({ fine: 1, close: 0, over: 0 });
    expect((await october("mine")).budgets).toEqual({ fine: 0, close: 0, over: 1 });
  });
});

describe("latest transactions", () => {
  it("lists the 5 newest shown, transfers included, removed ones left out", async () => {
    for (const day of ["01", "02", "03", "04"]) await record(`2026-10-${day}`, day);
    await addTransfer(MEMBER, {
      date: "2026-10-05",
      amountCents: peso("5"),
      fromAccountId: bpiId,
      toAccountId: gcashId,
      envelope: { kind: "category", id: groceriesId },
    });
    await record("2026-10-06", "6");
    await recordPersonal(MEMBER, walletId, "7", "expense");
    const removed = await record("2026-10-08", "8");
    await removeTransaction(MEMBER, removed.id);

    const latest = (await october()).latest.map((row) => row.amountCents);
    expect(latest).toEqual([600, 500, 400, 300, 200]);
    expect((await october("mine")).latest.map((row) => row.amountCents)).toEqual([700]);
  });
});
