/**
 * Reports' Spending: each category's expenses less its income, by month,
 * folded from the transaction projection on every read. Transfers live in
 * their own projection, so they never count. Order-independent by construction.
 */

import { diffCents, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { shownIn, type FinanceView } from "@/lib/finances/view";
import type { TransactionRow } from "@/lib/transactions/projection";
import { monthOfDate, parseLocalDate } from "@/lib/utils/dates";

export interface MonthSpending {
  spent: Cents;
  /** What was spent on or before today's day of the month, for the previous period's cut. */
  spentToDay: Cents;
}

/** By month ("yyyy-MM"), then by category ID; null is Unassigned. */
export type SpendingGrid = Map<string, Map<string | null, MonthSpending>>;

export type SpendingGrids = Record<FinanceView, SpendingGrid>;

function foldView(transactions: TransactionRow[], todayDay: number): SpendingGrid {
  const grid: SpendingGrid = new Map();
  for (const transaction of transactions) {
    const month = monthOfDate(transaction.date);
    let categories = grid.get(month);
    if (!categories) {
      categories = new Map();
      grid.set(month, categories);
    }
    const cell = categories.get(transaction.categoryId) ?? {
      spent: ZERO_CENTS,
      spentToDay: ZERO_CENTS,
    };
    const add = (total: Cents) =>
      transaction.type === "expense"
        ? sumCents([total, transaction.amountCents])
        : diffCents(total, transaction.amountCents);
    categories.set(transaction.categoryId, {
      spent: add(cell.spent),
      spentToDay:
        parseLocalDate(transaction.date).getDate() <= todayDay
          ? add(cell.spentToDay)
          : cell.spentToDay,
    });
  }
  return grid;
}

/** Household and Mine never blend, so each view keeps its own Unassigned. */
export function foldSpending(
  transactions: TransactionRow[],
  userId: string,
  todayDay: number
): SpendingGrids {
  const kept = transactions.filter((transaction) => !transaction.removed);
  return {
    household: foldView(kept.filter(shownIn("household", userId)), todayDay),
    mine: foldView(kept.filter(shownIn("mine", userId)), todayDay),
  };
}
