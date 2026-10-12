import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP, ZERO_CENTS, type Cents } from "@/lib/currency";
import { cents } from "@/test/cents";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { UNASSIGNED_ENVELOPE } from "@/lib/allocations/events";
import { createAccount } from "@/lib/commands/accounts";
import { addAllocation } from "@/lib/commands/allocations";
import { setBudget } from "@/lib/commands/budgets";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransaction, removeTransaction } from "@/lib/commands/transactions";
import { listAccounts } from "@/lib/accounts/projection";
import type { TransactionRow } from "@/lib/transactions/projection";
import { categoryMonth, readMonthView, summarizeMonth, sumMonthFigures } from "./month";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

const peso = (amount: string): Cents => parsePHP(amount);

let bpiId: string;
let visaId: string;
let groceriesId: string;
let restaurantsId: string;

const groceries = (date: string, amount: string, type = "expense", accountId = bpiId) =>
  addTransaction(MEMBER, {
    date,
    type,
    amountCents: peso(amount),
    accountId,
    categoryId: groceriesId,
  });

const october = () => readMonthView("2026-10", "2026-11");

beforeEach(async () => {
  await resetLocalDatabase();
  bpiId = (
    await createAccount(MEMBER, { name: "BPI", type: "bank", startingBalanceCents: peso("50000") })
  ).id;
  visaId = (
    await createAccount(MEMBER, {
      name: "Visa",
      type: "credit_card",
      startingBalanceCents: peso("0"),
      payingAccountId: bpiId,
    })
  ).id;
  const food = await createGroup(MEMBER, { name: "Food" });
  groceriesId = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
  restaurantsId = (await createCategory(MEMBER, { name: "Restaurants", groupId: food.id })).id;
});

describe("month figures", () => {
  it("shows the issue's demo: budget ₱8,000 and ₱1,200 spent in October", async () => {
    await setBudget(MEMBER, {
      categoryId: groceriesId,
      fromMonth: "2026-10",
      amountCents: peso("8000"),
      accountId: bpiId,
    });
    await groceries("2026-10-05", "1200");

    expect(categoryMonth(await october(), groceriesId)).toMatchObject({
      budget: { amountCents: 800000, accountId: bpiId, fromMonth: "2026-10" },
      spent: 120000,
    });
  });

  it("counts spent as expenses minus refunds by local date, card purchases on their purchase date", async () => {
    await groceries("2026-09-30", "999");
    await groceries("2026-10-01", "1200");
    await groceries("2026-10-20", "200", "income");
    await groceries("2026-10-31", "500", "expense", visaId);
    await groceries("2026-11-01", "300");
    const removed = await groceries("2026-10-10", "4000");
    await removeTransaction(MEMBER, removed.id);

    expect(categoryMonth(await october(), groceriesId).spent).toBe(150000);
  });

  it("nets allocations into and out of the category dated in the month", async () => {
    const allocate = (date: string, amount: string, from = UNASSIGNED_ENVELOPE, to = groceriesId) =>
      addAllocation(MEMBER, {
        date,
        accountId: bpiId,
        from,
        to: { kind: "category", id: to },
        amountCents: peso(amount),
      });
    await allocate("2026-09-28", "5000");
    await allocate("2026-10-01", "8000");
    await allocate("2026-10-15", "1000", { kind: "category", id: groceriesId }, restaurantsId);
    await allocate("2026-11-01", "700");

    const view = await october();
    expect(categoryMonth(view, groceriesId).allocated).toBe(700000);
    expect(categoryMonth(view, restaurantsId).allocated).toBe(100000);
  });

  it("gives the money at the end of a past month, and the current money for this month", async () => {
    await addAllocation(MEMBER, {
      date: "2026-10-01",
      accountId: bpiId,
      from: UNASSIGNED_ENVELOPE,
      to: { kind: "category", id: groceriesId },
      amountCents: peso("8000"),
    });
    await groceries("2026-10-05", "1500", "expense", visaId);
    await groceries("2026-11-03", "300");
    await groceries("2026-12-01", "100");

    const oct = categoryMonth(await october(), groceriesId);
    expect(oct.money).toBe(650000);
    expect(oct.moneyByAccount).toEqual(new Map([[bpiId, cents(650000)]]));
    expect(categoryMonth(await readMonthView("2026-11", "2026-11"), groceriesId).money).toBe(
      610000
    );
    expect(categoryMonth(await readMonthView("2026-09", "2026-11"), groceriesId).money).toBe(0);
  });

  it("shows nothing for a month before any budget or activity", async () => {
    await groceries("2026-10-05", "1200");

    expect(categoryMonth(await readMonthView("2026-09", "2026-11"), groceriesId)).toEqual({
      budget: null,
      spent: ZERO_CENTS,
      allocated: ZERO_CENTS,
      money: ZERO_CENTS,
      moneyByAccount: new Map(),
    });
  });

  it("sums a group's categories, counting no budget as zero", async () => {
    await setBudget(MEMBER, {
      categoryId: groceriesId,
      fromMonth: "2026-10",
      amountCents: peso("8000"),
      accountId: bpiId,
    });
    await setBudget(MEMBER, {
      categoryId: restaurantsId,
      fromMonth: "2026-08",
      amountCents: peso("2000"),
      accountId: bpiId,
    });
    await groceries("2026-10-05", "1200");
    await addTransaction(MEMBER, {
      date: "2026-10-06",
      type: "expense",
      amountCents: peso("800"),
      accountId: bpiId,
      categoryId: restaurantsId,
    });

    const view = await october();
    expect(
      sumMonthFigures([groceriesId, restaurantsId].map((id) => categoryMonth(view, id)))
    ).toEqual({
      budget: cents(1000000),
      spent: cents(200000),
      allocated: ZERO_CENTS,
      money: cents(-200000),
    });
    const september = await readMonthView("2026-09", "2026-11");
    expect(
      sumMonthFigures([groceriesId, restaurantsId].map((id) => categoryMonth(september, id))).budget
    ).toBe(200000);
  });

  it("sums 10,000 transactions for a past month in under 50 ms", async () => {
    const accounts = await listAccounts();
    const transactions = Array.from({ length: 10_000 }, (_, index): TransactionRow => ({
      id: `t-${index}`,
      householdId: MEMBER.householdId,
      visibility: "household",
      ownerUserId: null,
      date: `2026-${String((index % 12) + 1).padStart(2, "0")}-15`,
      type: index % 3 === 0 ? "income" : "expense",
      amountCents: cents(100 + index),
      accountId: index % 2 === 0 ? bpiId : visaId,
      categoryId: index % 4 === 0 ? null : groceriesId,
      payingAccountId: index % 2 === 0 ? null : bpiId,
      description: "",
      notes: "",
      status: "cleared",
      removed: false,
      recordedHlc: String(index),
    }));

    const started = performance.now();
    const view = summarizeMonth("2026-06", "2026-11", {
      accounts,
      transactions,
      allocations: [],
      budgets: [],
    });
    const elapsed = performance.now() - started;

    expect(categoryMonth(view, groceriesId).spent).not.toBe(0);
    expect(elapsed).toBeLessThan(50);
  });
});
