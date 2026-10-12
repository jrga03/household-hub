import type { Cents } from "@/lib/currency";
import type { BudgetRow } from "./projection";

export interface Budget {
  amountCents: Cents;
  /** The funding account. */
  accountId: string;
  /** The month this version was set from. */
  fromMonth: string;
}

/** A row's budget, or null when it clears one. */
function asBudget(row: BudgetRow): Budget | null {
  if (row.amountCents === null || row.accountId === null) return null;
  return { amountCents: row.amountCents, accountId: row.accountId, fromMonth: row.fromMonth };
}

/** The version with the latest month at or before the given one ("yyyy-MM" sorts as text). */
function latestVersion(rows: BudgetRow[], month: string): BudgetRow | undefined {
  let latest: BudgetRow | undefined;
  for (const row of rows) {
    if (row.fromMonth <= month && (!latest || row.fromMonth > latest.fromMonth)) latest = row;
  }
  return latest;
}

/** The category's budget for the month: the latest set at or before it, unless that cleared it. */
export function budgetInForce(budgets: BudgetRow[], categoryId: string, month: string) {
  const version = latestVersion(
    budgets.filter((row) => row.categoryId === categoryId),
    month
  );
  return version ? asBudget(version) : null;
}

/** Every category's budget for the month, by category ID; categories without one are left out. */
export function budgetsInForce(budgets: BudgetRow[], month: string): Map<string, Budget> {
  const inForce = new Map<string, Budget>();
  for (const categoryId of new Set(budgets.map((row) => row.categoryId))) {
    const budget = budgetInForce(budgets, categoryId, month);
    if (budget) inForce.set(categoryId, budget);
  }
  return inForce;
}

/** Every version of the category's budget, latest month first; a cleared one ends the one before it. */
export const budgetHistory = (budgets: BudgetRow[], categoryId: string): BudgetRow[] =>
  budgets
    .filter((row) => row.categoryId === categoryId)
    .sort((a, b) => b.fromMonth.localeCompare(a.fromMonth));
