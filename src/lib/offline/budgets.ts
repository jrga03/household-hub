/**
 * Local Dexie mirror + offline reads for budget targets (review R11)
 *
 * Budgets are the one core entity with NO other path into IndexedDB: budget
 * mutations write straight to Supabase and there is no realtime subscription
 * for the budgets table. So useBudgets (lib/supabaseQueries.ts) calls
 * `mirrorBudgetsForMonth` after every successful fetch - the read IS the
 * mirror - and `getLocalBudgetGroups` rebuilds the exact BudgetGroup[] shape
 * offline: mirrored targets + actual spending recomputed from
 * db.transactions (expenses only, transfers excluded, same month bounds).
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
// Type-only import: erased at compile time, so no runtime cycle with
// supabaseQueries (which imports this module for the fallback).
import type { Budget, BudgetGroup } from "@/lib/supabaseQueries";

/** Month key used by both the server query and the Dexie mirror ("yyyy-MM-01"). */
export function budgetMonthKey(month: Date): string {
  return format(startOfMonth(month), "yyyy-MM-dd");
}

function mirrorMarkerKey(monthKey: string): string {
  return `budgets_mirrored:${monthKey}`;
}

/**
 * Replaces the month's mirrored budget rows with the server result and
 * records the mirror marker, atomically. Replacement (not merge) is correct
 * here: the server result is the complete set for the month, so rows deleted
 * server-side disappear locally too.
 */
export async function mirrorBudgetsForMonth(monthKey: string, rows: LocalBudget[]): Promise<void> {
  await db.transaction("rw", db.budgets, db.meta, async () => {
    await db.budgets.where("month").equals(monthKey).delete();
    if (rows.length > 0) {
      await db.budgets.bulkPut(rows);
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

  const spendingMap = new Map<string, number>();
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
      const existing = spendingMap.get(t.category_id!) || 0;
      spendingMap.set(t.category_id!, existing + t.amount_cents);
    });

  // Build Budget objects (same derivations as the server path)
  const budgetObjects: Budget[] = budgets.map((b) => {
    const category = categoryById.get(b.category_id);
    const parent = category?.parent_id ? categoryById.get(category.parent_id) : undefined;
    const actualSpent = spendingMap.get(b.category_id) || 0;
    const remaining = b.amount_cents - actualSpent;
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

    if (!groupMap.has(parentName)) {
      const parent = parents.find((p) => p.name === parentName);
      groupMap.set(parentName, {
        parentName,
        parentColor: parent?.color || "#6B7280",
        totalBudgetCents: 0,
        totalSpentCents: 0,
        budgets: [],
      });
    }

    const group = groupMap.get(parentName)!;
    group.totalBudgetCents += budget.budgetAmountCents;
    group.totalSpentCents += budget.actualSpentCents;
    group.budgets.push(budget);
  });

  return Array.from(groupMap.values());
}
