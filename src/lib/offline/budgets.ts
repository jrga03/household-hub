/**
 * Local Dexie mirror + offline reads for budget targets (review R11)
 *
 * Budgets are the one core entity with NO realtime subscription: budget
 * mutations go through the local outbox (db.syncQueue, entity_type: "budget")
 * and there is no realtime path. So useBudgets (lib/supabaseQueries.ts) calls
 * `mirrorBudgetsForMonth` after every successful fetch - the read IS the
 * mirror - and `getLocalBudgetGroups` rebuilds the exact BudgetGroup[] shape
 * offline: mirrored targets + actual spending recomputed from
 * db.transactions (expenses only, transfers excluded, same month bounds).
 *
 * The mirror preserves budgets with pending unsynced work (creates/updates)
 * and excludes budgets with pending deletes.
 *
 * Budgets are reference targets only (Decision #80): no rollover, nothing
 * derived is ever stored.
 *
 * A per-month meta marker records that a month HAS been mirrored, so
 * "no budgets set for July" (serve an honest empty list) is distinguishable
 * from "July was never fetched on this device" (throw OfflineError so the
 * route can render a real offline state instead of a false 'no budgets').
 *
 * @module offline/budgets
 */

import { startOfMonth, endOfMonth, format } from "date-fns";
import { db, type LocalBudget } from "@/lib/dexie/db";
import { OfflineError } from "./errors";
import { buildSyncQueueItem } from "./syncQueue";
import { ZERO_CENTS, diffCents, sumCents, validateAmount, type Cents } from "@/lib/currency";
import type { OfflineOperationResult } from "./types";
import { supabase } from "@/lib/supabase";
import type { SyncQueueItem } from "@/types/sync";
// Type-only import: erased at compile time, so no runtime cycle with
// supabaseQueries (which imports this module for the fallback).
import type { Budget, BudgetGroup } from "@/lib/supabaseQueries";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";

/** Month key used by both the server query and the Dexie mirror ("yyyy-MM-01"). */
export function budgetMonthKey(month: Date): string {
  return format(startOfMonth(month), "yyyy-MM-dd");
}

function mirrorMarkerKey(monthKey: string): string {
  return `budgets_mirrored:${monthKey}`;
}

/**
 * Replaces the month's mirrored rows with the server result, except budgets
 * with unsynced local work: a pending create/update keeps the local row (it
 * wins over a server row for the same category), a pending delete keeps the
 * server row out. Atomic with the mirror marker.
 */
export async function mirrorBudgetsForMonth(monthKey: string, rows: LocalBudget[]): Promise<void> {
  await db.transaction("rw", db.budgets, db.meta, db.syncQueue, async () => {
    const pending = await db.syncQueue
      .filter(
        (item) =>
          item.entity_type === "budget" && (item.status === "queued" || item.status === "syncing")
      )
      .toArray();
    const pendingDeletes = new Set(
      pending.filter((item) => item.operation.op === "delete").map((item) => item.entity_id)
    );
    const pendingWrites = new Set(
      pending.filter((item) => item.operation.op !== "delete").map((item) => item.entity_id)
    );

    const keptLocal = (await db.budgets.where("month").equals(monthKey).toArray()).filter(
      (budget) => pendingWrites.has(budget.id)
    );
    const keptIds = new Set(keptLocal.map((budget) => budget.id));
    const keptCategories = new Set(keptLocal.map((budget) => budget.category_id));
    const serverRows = rows.filter(
      (row) =>
        !pendingDeletes.has(row.id) && !keptIds.has(row.id) && !keptCategories.has(row.category_id)
    );

    await db.budgets.where("month").equals(monthKey).delete();
    const merged = [...serverRows, ...keptLocal];
    if (merged.length > 0) {
      await db.budgets.bulkPut(merged);
    }
    await db.meta.put({ key: mirrorMarkerKey(monthKey), value: new Date().toISOString() });
  });
}

/** True when this month's budgets have been mirrored at least once. */
export async function hasMirroredBudgets(monthKey: string): Promise<boolean> {
  return (await db.meta.get(mirrorMarkerKey(monthKey))) !== undefined;
}

/**
 * Local mirror of the useBudgets Supabase query: mirrored targets for the
 * month + actual spending recomputed from db.transactions with the same
 * clauses as the server (type = expense, transfer_group_id IS NULL, date
 * within the month), grouped by parent category with rollup totals.
 *
 * @throws OfflineError when the month was never mirrored on this device
 */
export async function getLocalBudgetGroups(month: Date): Promise<BudgetGroup[]> {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const monthKey = format(monthStart, "yyyy-MM-dd");

  if (!(await hasMirroredBudgets(monthKey))) {
    throw new OfflineError(`the ${format(month, "MMMM yyyy")} budgets`);
  }

  const budgets = await db.budgets.where("month").equals(monthKey).toArray();
  if (budgets.length === 0) {
    return []; // genuinely no budgets set for this month
  }

  // Server parity: the budgets query joins categories without an is_active
  // filter, and the parents query is only filtered on parent_id IS NULL
  const categories = await db.categories.toArray();
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const parents = categories.filter((c) => c.parent_id == null);

  // Actual spending per budgeted category
  // CRITICAL: expenses only, transfers excluded (transfer_group_id not set)
  const budgetedCategoryIds = new Set(budgets.map((b) => b.category_id));
  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");

  const spendingMap = new Map<string, Cents>();
  await db.transactions
    .filter(
      (t) =>
        !t.transfer_group_id &&
        t.type === "expense" &&
        !!t.category_id &&
        budgetedCategoryIds.has(t.category_id) &&
        t.date >= monthStartStr &&
        t.date <= monthEndStr
    )
    .each((t) => {
      if (!t.category_id) return;
      const existing = spendingMap.get(t.category_id) ?? ZERO_CENTS;
      spendingMap.set(t.category_id, sumCents([existing, t.amount_cents]));
    });

  // Build Budget objects (same derivations as the server path)
  const budgetObjects: Budget[] = budgets.map((b) => {
    const category = categoryById.get(b.category_id);
    const parent = category?.parent_id ? categoryById.get(category.parent_id) : undefined;
    const actualSpent = spendingMap.get(b.category_id) ?? ZERO_CENTS;
    const remaining = diffCents(b.amount_cents, actualSpent);
    const percentUsed = b.amount_cents > 0 ? (actualSpent / b.amount_cents) * 100 : 0;

    return {
      id: b.id,
      categoryId: b.category_id,
      categoryName: category?.name || "Unknown",
      categoryColor: category?.color || "#6B7280",
      parentCategoryName: parent?.name || "Uncategorized",
      budgetAmountCents: b.amount_cents,
      actualSpentCents: actualSpent,
      remainingCents: remaining,
      percentUsed,
      isOverBudget: actualSpent > b.amount_cents,
    };
  });

  // Group by parent category (same as the server path)
  const groupMap = new Map<string, BudgetGroup>();

  budgetObjects.forEach((budget) => {
    const parentName = budget.parentCategoryName;

    const group = groupMap.get(parentName) ?? {
      parentName,
      parentColor: parents.find((p) => p.name === parentName)?.color || "#6B7280",
      totalBudgetCents: ZERO_CENTS,
      totalSpentCents: ZERO_CENTS,
      budgets: [],
    };
    groupMap.set(parentName, group);
    group.totalBudgetCents = sumCents([group.totalBudgetCents, budget.budgetAmountCents]);
    group.totalSpentCents = sumCents([group.totalSpentCents, budget.actualSpentCents]);
    group.budgets.push(budget);
  });

  return Array.from(groupMap.values());
}

// ─── Offline budget mutations ─────────────────────

export interface BudgetInput {
  categoryId: string;
  month: Date;
  amountCents: Cents;
}

// created_at is left to the server: a conflict upsert must not rewrite it
function createPayload(budget: LocalBudget): Record<string, unknown> {
  return {
    id: budget.id,
    household_id: budget.household_id,
    category_id: budget.category_id,
    month: budget.month,
    amount_cents: budget.amount_cents,
    currency_code: budget.currency_code,
  };
}

function newBudget(
  categoryId: string,
  monthKey: string,
  amountCents: Cents,
  now: string
): LocalBudget {
  return {
    id: crypto.randomUUID(),
    household_id: DEFAULT_HOUSEHOLD_ID,
    category_id: categoryId,
    month: monthKey,
    amount_cents: amountCents,
    currency_code: "PHP",
    created_at: now,
    updated_at: now,
  };
}

function failure<T>(error: unknown, fallback: string): OfflineOperationResult<T> {
  return {
    success: false,
    error: error instanceof Error ? error.message : fallback,
    isTemporary: false,
  };
}

export async function createOfflineBudget(
  input: BudgetInput,
  userId: string
): Promise<OfflineOperationResult<LocalBudget>> {
  if (!validateAmount(input.amountCents)) {
    return { success: false, error: "Invalid budget amount", isTemporary: false };
  }
  try {
    const monthKey = budgetMonthKey(input.month);
    const existing = await db.budgets
      .where("[month+category_id]")
      .equals([monthKey, input.categoryId])
      .first();
    if (existing) {
      return updateOfflineBudget(existing.id, input.amountCents, userId);
    }

    const budget = newBudget(
      input.categoryId,
      monthKey,
      input.amountCents,
      new Date().toISOString()
    );
    const queueItem = await buildSyncQueueItem(
      "budget",
      budget.id,
      "create",
      createPayload(budget),
      userId
    );
    await db.transaction("rw", db.budgets, db.syncQueue, async () => {
      await db.budgets.add(budget);
      await db.syncQueue.add(queueItem);
    });
    return { success: true, data: budget, isTemporary: true };
  } catch (error) {
    console.error("Failed to create offline budget:", error);
    return failure(error, "Failed to create budget");
  }
}

export async function updateOfflineBudget(
  id: string,
  amountCents: Cents,
  userId: string
): Promise<OfflineOperationResult<LocalBudget>> {
  if (!validateAmount(amountCents)) {
    return { success: false, error: "Invalid budget amount", isTemporary: false };
  }
  try {
    const existing = await db.budgets.get(id);
    if (!existing) {
      return { success: false, error: "Budget not found", isTemporary: false };
    }
    const updated: LocalBudget = {
      ...existing,
      amount_cents: amountCents,
      updated_at: new Date().toISOString(),
    };
    const queueItem = await buildSyncQueueItem(
      "budget",
      id,
      "update",
      { amount_cents: updated.amount_cents, updated_at: updated.updated_at },
      userId
    );
    await db.transaction("rw", db.budgets, db.syncQueue, async () => {
      await db.budgets.put(updated);
      await db.syncQueue.add(queueItem);
    });
    return { success: true, data: updated, isTemporary: true };
  } catch (error) {
    console.error("Failed to update offline budget:", error);
    return failure(error, "Failed to update budget");
  }
}

export async function deleteOfflineBudget(
  id: string,
  userId: string
): Promise<OfflineOperationResult<void>> {
  try {
    const existing = await db.budgets.get(id);
    if (!existing) {
      return { success: false, error: "Budget not found", isTemporary: false };
    }
    const queueItem = await buildSyncQueueItem("budget", id, "delete", { id }, userId);
    await db.transaction("rw", db.budgets, db.syncQueue, async () => {
      await db.budgets.delete(id);
      await db.syncQueue.add(queueItem);
    });
    return { success: true, isTemporary: true };
  } catch (error) {
    console.error("Failed to delete offline budget:", error);
    return failure(error, "Failed to delete budget");
  }
}

export async function copyOfflineBudgets(
  fromMonth: Date,
  toMonth: Date,
  userId: string
): Promise<OfflineOperationResult<LocalBudget[]>> {
  try {
    const fromKey = budgetMonthKey(fromMonth);
    const toKey = budgetMonthKey(toMonth);

    let source: Array<{ category_id: string; amount_cents: Cents }>;
    if (await hasMirroredBudgets(fromKey)) {
      source = await db.budgets.where("month").equals(fromKey).toArray();
    } else {
      const { data, error } = await supabase
        .from("budgets")
        .select("category_id, amount_cents")
        .eq("month", fromKey);
      if (error) return failure(error, "Failed to load previous month's budgets");
      source = data ?? [];
    }
    if (source.length === 0) {
      return { success: false, error: "No budgets found for previous month", isTemporary: false };
    }

    const now = new Date().toISOString();
    const rows: LocalBudget[] = [];
    const queueItems: SyncQueueItem[] = [];
    for (const { category_id, amount_cents } of source) {
      const existing = await db.budgets
        .where("[month+category_id]")
        .equals([toKey, category_id])
        .first();
      if (existing) {
        const updated = { ...existing, amount_cents, updated_at: now };
        rows.push(updated);
        queueItems.push(
          await buildSyncQueueItem(
            "budget",
            existing.id,
            "update",
            { amount_cents, updated_at: now },
            userId
          )
        );
      } else {
        const budget = newBudget(category_id, toKey, amount_cents, now);
        rows.push(budget);
        queueItems.push(
          await buildSyncQueueItem("budget", budget.id, "create", createPayload(budget), userId)
        );
      }
    }

    await db.transaction("rw", db.budgets, db.syncQueue, async () => {
      await db.budgets.bulkPut(rows);
      await db.syncQueue.bulkAdd(queueItems);
    });
    return { success: true, data: rows, isTemporary: true };
  } catch (error) {
    console.error("Failed to copy offline budgets:", error);
    return failure(error, "Failed to copy budgets");
  }
}
