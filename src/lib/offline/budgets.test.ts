/**
 * Tests for the budgets Dexie mirror + offline read (review R11):
 * mirror round-trip must rebuild the exact BudgetGroup shape the server
 * path produces (actuals from local transactions, expenses only, transfers
 * excluded, month bounds), re-mirroring replaces the month, and a month
 * that was never mirrored throws a typed OfflineError instead of faking
 * "no budgets".
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { db, type LocalBudget, type LocalCategory, type LocalTransaction } from "@/lib/dexie/db";
import type { SyncQueueItem } from "@/types/sync";
import { supabase } from "@/lib/supabase";
import {
  budgetMonthKey,
  copyOfflineBudgets,
  createOfflineBudget,
  deleteOfflineBudget,
  getLocalBudgetGroups,
  hasMirroredBudgets,
  mirrorBudgetsForMonth,
  updateOfflineBudget,
} from "./budgets";
import { OfflineError } from "./errors";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  },
}));

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
    const food = groups[0]!.budgets[0]!;

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
    expect(groups[0]!.budgets[0]!).toMatchObject({ id: "b-food", budgetAmountCents: 60000 });
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

// ─── Pending sync queue handling ──────────────────

describe("mirrorBudgetsForMonth with pending sync queue items", () => {
  beforeEach(async () => {
    await db.budgets.clear();
    await db.meta.clear();
    await db.syncQueue.clear();
  });

  async function queueBudgetOp(
    entityId: string,
    op: "create" | "update" | "delete"
  ): Promise<void> {
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      household_id: "hh-1",
      entity_type: "budget",
      entity_id: entityId,
      operation: {
        op,
        payload: { id: entityId },
        idempotencyKey: `k-${entityId}-${op}`,
        lamportClock: 1,
      },
      device_id: "dev-1",
      user_id: "user-1",
      status: "queued",
      retry_count: 0,
      max_retries: 3,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      synced_at: null,
      next_retry_at: null,
    } as SyncQueueItem);
  }

  it("keeps a local budget with a pending create when the server does not have it yet", async () => {
    const local = makeBudget({ id: "local-1", category_id: "cat-food", amount_cents: 70000 });
    await db.budgets.put(local);
    await queueBudgetOp("local-1", "create");

    await mirrorBudgetsForMonth(JULY_KEY, []);

    expect(await db.budgets.get("local-1")).toEqual(local);
  });

  it("prefers a pending local row over a server row for the same category", async () => {
    const local = makeBudget({ id: "local-1", category_id: "cat-food", amount_cents: 70000 });
    await db.budgets.put(local);
    await queueBudgetOp("local-1", "update");

    await mirrorBudgetsForMonth(JULY_KEY, [
      makeBudget({ id: "server-1", category_id: "cat-food", amount_cents: 10000 }),
    ]);

    expect(await db.budgets.where("month").equals(JULY_KEY).toArray()).toEqual([local]);
  });

  it("does not resurrect a budget with a pending delete", async () => {
    await queueBudgetOp("server-1", "delete");

    await mirrorBudgetsForMonth(JULY_KEY, [makeBudget({ id: "server-1" })]);

    expect(await db.budgets.get("server-1")).toBeUndefined();
  });

  it("ignores completed queue items", async () => {
    const local = makeBudget({ id: "local-1" });
    await db.budgets.put(local);
    await queueBudgetOp("local-1", "create");
    await db.syncQueue.toCollection().modify({ status: "completed" });

    await mirrorBudgetsForMonth(JULY_KEY, []);

    expect(await db.budgets.get("local-1")).toBeUndefined();
  });
});

// ─── Offline budget mutations ─────────────────────

describe("offline budget mutations", () => {
  const userId = "12345678-1234-5678-1234-567812345678";
  const OCTOBER = new Date(2026, 9, 10);
  const OCTOBER_KEY = "2026-10-01";

  beforeEach(async () => {
    await db.budgets.clear();
    await db.syncQueue.clear();
    await db.meta.clear();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as never);
  });

  it("creates a budget and queues a create without created_at", async () => {
    const result = await createOfflineBudget(
      { categoryId: "cat-food", month: OCTOBER, amountCents: 500000 },
      userId
    );

    expect(result.success).toBe(true);
    expect(await db.budgets.get(result.data!.id)).toMatchObject({
      category_id: "cat-food",
      month: OCTOBER_KEY,
      amount_cents: 500000,
    });
    const item = (await db.syncQueue.toArray())[0]!;
    expect(item).toMatchObject({ entity_type: "budget", entity_id: result.data!.id });
    expect(item.operation.op).toBe("create");
    expect(item.operation.payload).not.toHaveProperty("created_at");
  });

  it("turns a create for an existing category and month into an update", async () => {
    const first = await createOfflineBudget(
      { categoryId: "cat-food", month: OCTOBER, amountCents: 1000 },
      userId
    );
    await db.syncQueue.clear();

    const second = await createOfflineBudget(
      { categoryId: "cat-food", month: OCTOBER, amountCents: 2000 },
      userId
    );

    expect(second.data!.id).toBe(first.data!.id);
    expect(await db.budgets.count()).toBe(1);
    const item = (await db.syncQueue.toArray())[0]!;
    expect(item.operation.op).toBe("update");
  });

  it("queues only the changed fields on update", async () => {
    const created = await createOfflineBudget(
      { categoryId: "cat-food", month: OCTOBER, amountCents: 1000 },
      userId
    );
    await db.syncQueue.clear();

    await updateOfflineBudget(created.data!.id, 3000, userId);

    const item = (await db.syncQueue.toArray())[0]!;
    expect(Object.keys(item.operation.payload).sort()).toEqual(["amount_cents", "updated_at"]);
    expect((await db.budgets.get(created.data!.id))?.amount_cents).toBe(3000);
  });

  it("deletes a budget and queues a delete", async () => {
    const created = await createOfflineBudget(
      { categoryId: "cat-food", month: OCTOBER, amountCents: 1000 },
      userId
    );
    await db.syncQueue.clear();

    const result = await deleteOfflineBudget(created.data!.id, userId);

    expect(result.success).toBe(true);
    expect(await db.budgets.get(created.data!.id)).toBeUndefined();
    expect((await db.syncQueue.toArray())[0]!.operation.op).toBe("delete");
  });

  it("rejects an invalid amount and a missing budget without writing", async () => {
    expect(
      (await createOfflineBudget({ categoryId: "c", month: OCTOBER, amountCents: -1 }, userId))
        .success
    ).toBe(false);
    expect((await updateOfflineBudget("missing", 1000, userId)).success).toBe(false);
    expect((await deleteOfflineBudget("missing", userId)).success).toBe(false);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("copies from a mirrored month, updating existing targets and creating the rest", async () => {
    await mirrorBudgetsForMonth("2026-09-01", [
      makeBudget({ id: "s1", month: "2026-09-01", category_id: "cat-food", amount_cents: 1000 }),
      makeBudget({ id: "s2", month: "2026-09-01", category_id: "cat-rent", amount_cents: 2000 }),
    ]);
    const existing = await createOfflineBudget(
      { categoryId: "cat-food", month: OCTOBER, amountCents: 1 },
      userId
    );
    await db.syncQueue.clear();

    const result = await copyOfflineBudgets(new Date(2026, 8, 1), OCTOBER, userId);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect((await db.budgets.get(existing.data!.id))?.amount_cents).toBe(1000);
    const ops = (await db.syncQueue.toArray()).map((item) => item.operation.op).sort();
    expect(ops).toEqual(["create", "update"]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("copies from the server when the source month was never mirrored", async () => {
    const eq = vi
      .fn()
      .mockResolvedValue({ data: [{ category_id: "cat-food", amount_cents: 4000 }], error: null });
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ eq }) } as never);

    const result = await copyOfflineBudgets(new Date(2026, 8, 1), OCTOBER, userId);

    expect(eq).toHaveBeenCalledWith("month", "2026-09-01");
    expect(result.data?.[0]).toMatchObject({
      category_id: "cat-food",
      month: OCTOBER_KEY,
      amount_cents: 4000,
    });
  });

  it("reports an empty source month", async () => {
    await mirrorBudgetsForMonth("2026-09-01", []);
    const result = await copyOfflineBudgets(new Date(2026, 8, 1), OCTOBER, userId);
    expect(result).toMatchObject({ success: false, error: "No budgets found for previous month" });
  });
});
