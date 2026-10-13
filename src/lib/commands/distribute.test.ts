import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed } from "@/lib/events/log";
import { listAllocations } from "@/lib/allocations/projection";
import { readDistributeLines } from "@/lib/budgets/distribute";
import { parsePHP, type Cents } from "@/lib/currency";
import { readAccountMoney } from "@/lib/transactions/money";
import { listTransfers } from "@/lib/transfers/projection";
import { createAccount } from "./accounts";
import { setBudget } from "./budgets";
import { createCategory, createGroup, retireCategory } from "./categories";
import { distributeMoney, type DistributeInput } from "./distribute";
import { addTransaction } from "./transactions";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

const peso = (amount: string): Cents => parsePHP(amount);

const account = (name: string) =>
  createAccount(MEMBER, { name, type: "bank", startingBalanceCents: peso("0") });

let bpi: string;
let gcash: string;
let groceries: string;
let transportation: string;
let utilities: string;

const payroll = (date: string) =>
  addTransaction(MEMBER, {
    date,
    type: "income",
    amountCents: peso("40000"),
    accountId: bpi,
    categoryId: null,
    description: "Test",
  });

async function unassignedIn(accountId: string) {
  return (await readAccountMoney()).get(accountId)?.envelopes?.unassigned;
}

const budget = (categoryId: string, amount: string, accountId: string) => ({
  categoryId,
  fromMonth: "2026-10",
  amountCents: peso(amount),
  accountId,
});

const demoLines = (): DistributeInput["lines"] => [
  { categoryId: groceries, accountId: bpi, amountCents: peso("8000") },
  { categoryId: transportation, accountId: gcash, amountCents: peso("3000") },
  { categoryId: utilities, accountId: bpi, amountCents: peso("6000") },
];

beforeEach(async () => {
  await resetLocalDatabase();
  bpi = (await account("BPI")).id;
  gcash = (await account("GCash")).id;
  const group = await createGroup(MEMBER, { name: "Everyday" });
  const category = async (name: string) =>
    (await createCategory(MEMBER, { name, groupId: group.id })).id;
  groceries = await category("Groceries");
  transportation = await category("Transportation");
  utilities = await category("Utilities");
});

describe("distributeMoney", () => {
  it("sends other accounts' lines as one transfer each and allocates every line (the issue's demo)", async () => {
    await payroll("2026-10-15");

    await distributeMoney(MEMBER, { sourceAccountId: bpi, date: "2026-10-15", lines: demoLines() });

    expect(await listTransfers()).toMatchObject([
      {
        fromAccountId: bpi,
        toAccountId: gcash,
        amountCents: 300000,
        envelope: { kind: "unassigned" },
        date: "2026-10-15",
      },
    ]);
    const allocations = await listAllocations();
    expect(allocations).toHaveLength(3);
    expect(allocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: bpi, to: { kind: "category", id: groceries } }),
        expect.objectContaining({ accountId: bpi, to: { kind: "category", id: utilities } }),
        expect.objectContaining({ accountId: gcash, to: { kind: "category", id: transportation } }),
      ])
    );
    expect(await unassignedIn(bpi)).toBe(2300000);
    expect(await unassignedIn(gcash)).toBe(0);
  });

  it("prefills nothing on the second payday once the budgets are met", async () => {
    await setBudget(MEMBER, budget(groceries, "8000", bpi));
    await setBudget(MEMBER, budget(transportation, "3000", gcash));
    await setBudget(MEMBER, budget(utilities, "6000", bpi));
    await payroll("2026-10-15");
    await distributeMoney(MEMBER, { sourceAccountId: bpi, date: "2026-10-15", lines: demoLines() });

    await payroll("2026-10-30");

    const lines = await readDistributeLines(bpi, "2026-10", "income");
    expect(lines.map((line) => line.amountCents)).toEqual([0, 0, 0]);
  });

  it("prefills what is left when the first payday covered part of a budget", async () => {
    await setBudget(MEMBER, budget(groceries, "8000", bpi));
    await payroll("2026-10-15");
    await distributeMoney(MEMBER, {
      sourceAccountId: bpi,
      date: "2026-10-15",
      lines: [{ categoryId: groceries, accountId: bpi, amountCents: peso("5000") }],
    });

    expect(await readDistributeLines(bpi, "2026-10", "income")).toMatchObject([
      { categoryId: groceries, amountCents: 300000 },
    ]);
  });

  it("allows lines over the income, leaving Unassigned negative", async () => {
    await payroll("2026-10-15");

    await distributeMoney(MEMBER, {
      sourceAccountId: bpi,
      date: "2026-10-15",
      lines: [{ categoryId: groceries, accountId: bpi, amountCents: peso("45000") }],
    });

    expect(await unassignedIn(bpi)).toBe(-500000);
  });

  it("refuses a distribution with no amounts", async () => {
    await expect(
      distributeMoney(MEMBER, {
        sourceAccountId: bpi,
        date: "2026-10-15",
        lines: [{ categoryId: groceries, accountId: bpi, amountCents: peso("0") }],
      })
    ).rejects.toThrow("Enter an amount on at least one line.");
  });

  it("keeps none of it when one line is refused", async () => {
    await payroll("2026-10-15");
    await retireCategory(MEMBER, utilities);
    const before = (await listUnpushed(1000)).length;

    await expect(
      distributeMoney(MEMBER, { sourceAccountId: bpi, date: "2026-10-15", lines: demoLines() })
    ).rejects.toThrow(/Utilities/);

    expect(await listTransfers()).toEqual([]);
    expect(await listAllocations()).toEqual([]);
    expect(await listUnpushed(1000)).toHaveLength(before);
  });
});
