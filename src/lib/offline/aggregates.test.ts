/**
 * Tests for the local dashboard aggregates (review R11): a seeded Dexie
 * fixture must produce the same numbers the server-side useDashboardData
 * computation would - transfers excluded from analytics, included in
 * balances, month bounds on the DATE string, top-10 category breakdown,
 * 6-month trend, recent list capped at 10 including transfers.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db, type LocalTransaction, type LocalAccount, type LocalCategory } from "@/lib/dexie/db";
import { getLocalDashboardData, hasLocalFinancialData } from "./aggregates";

// ─── Fixture helpers ─────────────────────────────

function makeTransaction(overrides: Partial<LocalTransaction> = {}): LocalTransaction {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    date: "2026-07-05",
    description: "Test transaction",
    amount_cents: 10000,
    type: "expense",
    currency_code: "PHP",
    status: "cleared",
    visibility: "household",
    created_by_user_id: "user-1",
    tagged_user_ids: [],
    device_id: "dev-1",
    created_at: "2026-07-05T10:00:00.000Z",
    updated_at: "2026-07-05T10:00:00.000Z",
    ...overrides,
  };
}

function makeAccount(overrides: Partial<LocalAccount> = {}): LocalAccount {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    name: "Test Account",
    type: "bank",
    initial_balance_cents: 0,
    currency_code: "PHP",
    visibility: "household",
    color: "#0000ff",
    icon: "bank",
    sort_order: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
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

// July 2026, mid-month to keep month bucketing timezone-safe
const JULY = new Date(2026, 6, 15);

/**
 * Fixture (dashboard month = July 2026):
 * - acc-1 (active, ₱1,000.00 initial), acc-2 (active, ₱500.00 initial),
 *   acc-3 (INACTIVE, must not count)
 * - t1 expense 5000 food (07-05, cleared), t2 expense 3000 transport
 *   (07-06, pending), t3 income 20000 uncategorized (07-05, cleared)
 * - t4a/t4b transfer pair 10000 acc-1 → acc-2 (07-07): excluded from
 *   analytics, included in balances and the recent list
 * - t5 expense 7000 food in June (previous month)
 * - t6 expense 4000 in January (outside the 6-month trend window Feb-Jul)
 */
async function seedFixture() {
  await db.accounts.bulkAdd([
    makeAccount({ id: "acc-1", name: "Checking", initial_balance_cents: 100000 }),
    makeAccount({ id: "acc-2", name: "Savings", initial_balance_cents: 50000 }),
    makeAccount({
      id: "acc-3",
      name: "Old Wallet",
      initial_balance_cents: 999999,
      is_active: false,
    }),
  ]);

  await db.categories.bulkAdd([
    makeCategory({ id: "cat-p", name: "Essentials" }),
    makeCategory({ id: "cat-food", name: "Food", parent_id: "cat-p", color: "#ff0000" }),
    makeCategory({ id: "cat-transport", name: "Transport", parent_id: "cat-p", color: "#00ff00" }),
  ]);

  await db.transactions.bulkAdd([
    makeTransaction({
      id: "t1",
      amount_cents: 5000,
      category_id: "cat-food",
      account_id: "acc-1",
      date: "2026-07-05",
      created_at: "2026-07-05T08:00:00.000Z",
    }),
    makeTransaction({
      id: "t2",
      amount_cents: 3000,
      category_id: "cat-transport",
      account_id: "acc-1",
      date: "2026-07-06",
      status: "pending",
      created_at: "2026-07-06T08:00:00.000Z",
    }),
    makeTransaction({
      id: "t3",
      amount_cents: 20000,
      type: "income",
      account_id: "acc-2",
      date: "2026-07-05",
      created_at: "2026-07-05T09:00:00.000Z",
    }),
    makeTransaction({
      id: "t4a",
      amount_cents: 10000,
      account_id: "acc-1",
      transfer_group_id: "tg-1",
      date: "2026-07-07",
      created_at: "2026-07-07T08:00:00.000Z",
    }),
    makeTransaction({
      id: "t4b",
      amount_cents: 10000,
      type: "income",
      account_id: "acc-2",
      transfer_group_id: "tg-1",
      date: "2026-07-07",
      created_at: "2026-07-07T08:00:01.000Z",
    }),
    makeTransaction({
      id: "t5",
      amount_cents: 7000,
      category_id: "cat-food",
      account_id: "acc-1",
      date: "2026-06-15",
      created_at: "2026-06-15T08:00:00.000Z",
    }),
    makeTransaction({
      id: "t6",
      amount_cents: 4000,
      account_id: "acc-1",
      date: "2026-01-10",
      created_at: "2026-01-10T08:00:00.000Z",
    }),
  ]);
}

beforeEach(async () => {
  await db.transactions.clear();
  await db.accounts.clear();
  await db.categories.clear();
});

// ─── hasLocalFinancialData ───────────────────────

describe("hasLocalFinancialData", () => {
  it("is false on a device that never synced", async () => {
    expect(await hasLocalFinancialData()).toBe(false);
  });

  it("is true once any account or transaction exists locally", async () => {
    await db.accounts.add(makeAccount());
    expect(await hasLocalFinancialData()).toBe(true);
  });
});

// ─── getLocalDashboardData ───────────────────────

describe("getLocalDashboardData", () => {
  beforeEach(seedFixture);

  it("computes the month summary with transfers excluded (cents)", async () => {
    const { summary } = await getLocalDashboardData(JULY);

    expect(summary.totalIncomeCents).toBe(20000); // t3 only, NOT the transfer leg
    expect(summary.totalExpenseCents).toBe(8000); // t1 + t2, NOT the transfer leg
    expect(summary.netAmountCents).toBe(12000);
    expect(summary.transactionCount).toBe(3); // t1, t2, t3
    expect(summary.activeDays).toBe(2); // 07-05, 07-06
    expect(summary.uniqueCategories).toBe(2); // food, transport
    expect(summary.clearedCount).toBe(2); // t1, t3
    expect(summary.pendingCount).toBe(1); // t2
    expect(summary.previousMonthExpenseCents).toBe(7000); // t5
    expect(summary.previousMonthIncomeCents).toBe(0);
  });

  it("includes transfers in balances and counts only active accounts", async () => {
    const { summary } = await getLocalDashboardData(JULY);

    expect(summary.accountCount).toBe(2); // acc-3 inactive
    // acc-1: 100000 - 5000 - 3000 - 10000(transfer out) - 7000 - 4000 = 71000
    // acc-2: 50000 + 20000 + 10000(transfer in) = 80000
    // acc-3 (inactive) excluded entirely
    expect(summary.totalBalanceCents).toBe(151000);
  });

  it("builds an expense-only, transfer-excluded category breakdown", async () => {
    const { categoryBreakdown } = await getLocalDashboardData(JULY);

    expect(categoryBreakdown).toEqual([
      {
        categoryId: "cat-food",
        categoryName: "Food",
        color: "#ff0000",
        amountCents: 5000,
        percentOfTotal: 62.5,
      },
      {
        categoryId: "cat-transport",
        categoryName: "Transport",
        color: "#00ff00",
        amountCents: 3000,
        percentOfTotal: 37.5,
      },
    ]);
  });

  it("buckets the 6-month trend and drops rows outside the window", async () => {
    const { monthlyTrend } = await getLocalDashboardData(JULY);

    expect(monthlyTrend).toHaveLength(6);
    expect(monthlyTrend[5]).toEqual({ month: "Jul", incomeCents: 20000, expenseCents: 8000 });
    expect(monthlyTrend[4]).toEqual({ month: "Jun", incomeCents: 0, expenseCents: 7000 });
    // t6 (January) is outside the Feb-Jul window: no bucket contains it
    const totalExpenseAcrossTrend = monthlyTrend.reduce((sum, m) => sum + m.expenseCents, 0);
    expect(totalExpenseAcrossTrend).toBe(15000); // 8000 (Jul) + 7000 (Jun)
  });

  it("lists recent transactions INCLUDING transfers, joined from the mirrors", async () => {
    const { recentTransactions } = await getLocalDashboardData(JULY);

    expect(recentTransactions).toHaveLength(7); // whole fixture, under the cap
    // date desc, created_at desc: the newer transfer leg first
    expect(recentTransactions[0].id).toBe("t4b");
    expect(recentTransactions[1].id).toBe("t4a");
    expect(recentTransactions[0].account).toEqual({ id: "acc-2", name: "Savings" });
    const t1 = recentTransactions.find((t) => t.id === "t1");
    expect(t1?.category).toEqual({ id: "cat-food", name: "Food", color: "#ff0000" });
    expect(t1?.account).toEqual({ id: "acc-1", name: "Checking" });
  });

  it("caps the recent list at 10", async () => {
    await db.transactions.bulkAdd(
      Array.from({ length: 12 }, (_, i) =>
        makeTransaction({
          id: `bulk-${i}`,
          date: "2026-07-10",
          created_at: `2026-07-10T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
        })
      )
    );

    const { recentTransactions } = await getLocalDashboardData(JULY);

    expect(recentTransactions).toHaveLength(10);
  });
});
