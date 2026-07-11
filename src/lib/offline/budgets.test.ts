/**
 * Tests for the budgets Dexie mirror + offline read (review R11):
 * mirror round-trip must rebuild the exact BudgetGroup shape the server
 * path produces (actuals from local transactions, expenses only, transfers
 * excluded, month bounds), re-mirroring replaces the month, and a month
 * that was never mirrored throws a typed OfflineError instead of faking
 * "no budgets".
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db, type LocalBudget, type LocalCategory, type LocalTransaction } from "@/lib/dexie/db";
import {
  budgetMonthKey,
  getLocalBudgetGroups,
  hasMirroredBudgets,
  mirrorBudgetsForMonth,
} from "./budgets";
import { OfflineError } from "./errors";

// ─── Fixture helpers ─────────────────────────────

const JULY = new Date(2026, 6, 15);
const JULY_KEY = "2026-07-01";
const AUGUST_KEY = "2026-08-01";

function makeBudget(overrides: Partial<LocalBudget> = {}): LocalBudget {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    category_id: "cat-food",
    month: JULY_KEY,
    amount_cents: 50000,
    currency_code: "PHP",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeCategory(overrides: Partial<LocalCategory> = {}): LocalCategory {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    name: "Test Category",
    color: "#ff0000",
    icon: "tag",
    sort_order: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<LocalTransaction> = {}): LocalTransaction {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    date: "2026-07-10",
    description: "Test transaction",
    amount_cents: 10000,
    type: "expense",
    currency_code: "PHP",
    status: "cleared",
    visibility: "household",
    created_by_user_id: "user-1",
    tagged_user_ids: [],
    device_id: "dev-1",
    created_at: "2026-07-10T10:00:00.000Z",
    updated_at: "2026-07-10T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  await db.budgets.clear();
  await db.meta.clear();
  await db.categories.clear();
  await db.transactions.clear();
});

// ─── budgetMonthKey ──────────────────────────────

describe("budgetMonthKey", () => {
  it("normalizes any day of the month to the first ('yyyy-MM-01')", () => {
    expect(budgetMonthKey(new Date(2026, 6, 15))).toBe("2026-07-01");
    expect(budgetMonthKey(new Date(2026, 6, 1))).toBe("2026-07-01");
  });
});

// ─── getLocalBudgetGroups: never-mirrored month ──

describe("getLocalBudgetGroups without a mirror", () => {
  it("throws OfflineError instead of faking an empty month", async () => {
    await expect(getLocalBudgetGroups(JULY)).rejects.toBeInstanceOf(OfflineError);
  });
});

// ─── Mirror round-trip ───────────────────────────

describe("mirrorBudgetsForMonth + getLocalBudgetGroups", () => {
  beforeEach(async () => {
    await db.categories.bulkAdd([
      makeCategory({ id: "p-essentials", name: "Essentials", color: "#111111" }),
      makeCategory({ id: "cat-food", name: "Food", parent_id: "p-essentials", color: "#ff0000" }),
      makeCategory({ id: "p-fun", name: "Fun", color: "#222222" }),
      makeCategory({ id: "cat-games", name: "Games", parent_id: "p-fun", color: "#00ff00" }),
    ]);

    await db.transactions.bulkAdd([
      // Counts toward Food actuals
      makeTransaction({ id: "tx-food", category_id: "cat-food", amount_cents: 20000 }),
      // Transfer leg: MUST be excluded from actual spending
      makeTransaction({
        id: "tx-transfer",
        category_id: "cat-food",
        amount_cents: 5000,
        transfer_group_id: "tg-1",
      }),
      // Income: MUST be excluded (expenses only)
      makeTransaction({
        id: "tx-income",
        category_id: "cat-food",
        amount_cents: 3000,
        type: "income",
      }),
      // Outside the month: MUST be excluded
      makeTransaction({
        id: "tx-june",
        category_id: "cat-food",
        amount_cents: 9999,
        date: "2026-06-20",
      }),
    ]);
  });

  it("round-trips the server rows and rebuilds the BudgetGroup shape", async () => {
    await mirrorBudgetsForMonth(JULY_KEY, [
      makeBudget({ id: "b-food", category_id: "cat-food", amount_cents: 50000 }),
      makeBudget({ id: "b-games", category_id: "cat-games", amount_cents: 20000 }),
    ]);

    expect(await hasMirroredBudgets(JULY_KEY)).toBe(true);

    const groups = await getLocalBudgetGroups(JULY);
    expect(groups).toHaveLength(2);

    const essentials = groups.find((g) => g.parentName === "Essentials");
    expect(essentials).toMatchObject({
      parentColor: "#111111",
      totalBudgetCents: 50000,
      totalSpentCents: 20000, // tx-food only: transfer/income/June excluded
    });
    expect(essentials?.budgets).toHaveLength(1);
    expect(essentials?.budgets[0]).toEqual({
      id: "b-food",
      categoryId: "cat-food",
      categoryName: "Food",
      categoryColor: "#ff0000",
      parentCategoryName: "Essentials",
      budgetAmountCents: 50000,
      actualSpentCents: 20000,
      remainingCents: 30000,
      percentUsed: 40,
      isOverBudget: false,
    });

    const fun = groups.find((g) => g.parentName === "Fun");
    expect(fun).toMatchObject({
      parentColor: "#222222",
      totalBudgetCents: 20000,
      totalSpentCents: 0,
    });
  });

  it("flags over-budget categories", async () => {
    await mirrorBudgetsForMonth(JULY_KEY, [
      makeBudget({ id: "b-food", category_id: "cat-food", amount_cents: 10000 }),
    ]);

    const groups = await getLocalBudgetGroups(JULY);
    const food = groups[0].budgets[0];

    expect(food.actualSpentCents).toBe(20000);
    expect(food.remainingCents).toBe(-10000);
    expect(food.percentUsed).toBe(200);
    expect(food.isOverBudget).toBe(true);
  });

  it("re-mirroring REPLACES the month's rows (server deletions propagate)", async () => {
    await mirrorBudgetsForMonth(JULY_KEY, [
      makeBudget({ id: "b-food", category_id: "cat-food", amount_cents: 50000 }),
      makeBudget({ id: "b-games", category_id: "cat-games", amount_cents: 20000 }),
    ]);
    // Server state changed: games budget deleted, food amount updated
    await mirrorBudgetsForMonth(JULY_KEY, [
      makeBudget({ id: "b-food", category_id: "cat-food", amount_cents: 60000 }),
    ]);

    const groups = await getLocalBudgetGroups(JULY);

    expect(groups).toHaveLength(1);
    expect(groups[0].budgets[0]).toMatchObject({ id: "b-food", budgetAmountCents: 60000 });
  });

  it("only replaces the mirrored month, other months keep their rows", async () => {
    await mirrorBudgetsForMonth(AUGUST_KEY, [
      makeBudget({ id: "b-aug", category_id: "cat-food", month: AUGUST_KEY }),
    ]);
    await mirrorBudgetsForMonth(JULY_KEY, [
      makeBudget({ id: "b-jul", category_id: "cat-food", month: JULY_KEY }),
    ]);

    expect(await db.budgets.where("month").equals(AUGUST_KEY).count()).toBe(1);
    expect(await db.budgets.where("month").equals(JULY_KEY).count()).toBe(1);
  });

  it("a mirrored EMPTY month serves an honest empty list (no OfflineError)", async () => {
    await mirrorBudgetsForMonth(JULY_KEY, []);

    expect(await hasMirroredBudgets(JULY_KEY)).toBe(true);
    expect(await getLocalBudgetGroups(JULY)).toEqual([]);
  });
});
