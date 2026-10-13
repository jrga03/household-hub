/**
 * A month's figures per category, summed at read time from the budget,
 * transaction, allocation and transfer projections, so they are
 * order-independent by construction. Transfers never count as spent; they only
 * move a category's money between accounts.
 */

import type { AccountRow } from "@/lib/accounts/projection";
import type { AllocationRow } from "@/lib/allocations/projection";
import { diffCents, negateCents, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import { sumAccountMoney, sumCategoryMoney } from "@/lib/transactions/money";
import { monthOfDate } from "@/lib/utils/dates";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { TransferRow } from "@/lib/transfers/projection";
import { budgetsInForce, type Budget } from "./inForce";
import type { BudgetRow } from "./projection";

export interface MonthFigures {
  /** The budget in force; zero when there is none. */
  budget: Cents;
  /** Expenses minus refunds dated in the month. */
  spent: Cents;
  /** Allocations into the category dated in the month, less those out of it, in any account. */
  allocated: Cents;
  /** The category's money at the end of the month; its current money for this month. */
  money: Cents;
}

export interface CategoryMonth extends Omit<MonthFigures, "budget"> {
  budget: Budget | null;
  /** The category's money in each account holding some, by account ID. */
  moneyByAccount: Map<string, Cents>;
}

export interface MonthRecords {
  accounts: AccountRow[];
  transactions: TransactionRow[];
  allocations: AllocationRow[];
  transfers: TransferRow[];
  budgets: BudgetRow[];
}

/** By category ID; a category with no budget or activity is left out (see `categoryMonth`). */
export type MonthView = Map<string, CategoryMonth>;

const NOTHING_THIS_MONTH: CategoryMonth = {
  budget: null,
  spent: ZERO_CENTS,
  allocated: ZERO_CENTS,
  money: ZERO_CENTS,
  moneyByAccount: new Map(),
};

function entryFor(view: MonthView, categoryId: string): CategoryMonth {
  let entry = view.get(categoryId);
  if (!entry) {
    entry = { ...NOTHING_THIS_MONTH, moneyByAccount: new Map() };
    view.set(categoryId, entry);
  }
  return entry;
}

/**
 * The figures for `month` ("yyyy-MM"). For `currentMonth` the money is what
 * the category holds now, future-dated records included; for any other month,
 * what it held after the month's last day.
 */
export function summarizeMonth(
  month: string,
  currentMonth: string,
  { accounts, transactions, allocations, transfers, budgets }: MonthRecords
): MonthView {
  const view: MonthView = new Map();

  for (const [categoryId, budget] of budgetsInForce(budgets, month)) {
    entryFor(view, categoryId).budget = budget;
  }

  for (const transaction of transactions) {
    const { categoryId } = transaction;
    if (transaction.removed || categoryId === null || monthOfDate(transaction.date) !== month)
      continue;
    const entry = entryFor(view, categoryId);
    const { amountCents } = transaction;
    entry.spent =
      transaction.type === "expense"
        ? sumCents([entry.spent, amountCents])
        : diffCents(entry.spent, amountCents);
  }

  for (const allocation of allocations) {
    if (allocation.removed || monthOfDate(allocation.date) !== month) continue;
    if (allocation.to.kind === "category") {
      const entry = entryFor(view, allocation.to.id);
      entry.allocated = sumCents([entry.allocated, allocation.amountCents]);
    }
    if (allocation.from.kind === "category") {
      const entry = entryFor(view, allocation.from.id);
      entry.allocated = sumCents([entry.allocated, negateCents(allocation.amountCents)]);
    }
  }

  const byMonthEnd = (record: { date: string }) =>
    month === currentMonth || monthOfDate(record.date) <= month;
  const money = sumCategoryMoney(
    sumAccountMoney(
      accounts,
      transactions.filter(byMonthEnd),
      allocations.filter(byMonthEnd),
      transfers.filter(byMonthEnd)
    )
  );
  for (const [categoryId, { total, byAccount }] of money) {
    const entry = entryFor(view, categoryId);
    entry.money = total;
    entry.moneyByAccount = byAccount;
  }

  return view;
}

/** The category's figures, all zero when it had no budget or activity. */
export const categoryMonth = (view: MonthView, categoryId: string): CategoryMonth =>
  view.get(categoryId) ?? NOTHING_THIS_MONTH;

/** A group's figures: the sums of its categories'. */
export function sumMonthFigures(categories: CategoryMonth[]): MonthFigures {
  return {
    budget: sumCents(categories.map((category) => category.budget?.amountCents ?? ZERO_CENTS)),
    spent: sumCents(categories.map((category) => category.spent)),
    allocated: sumCents(categories.map((category) => category.allocated)),
    money: sumCents(categories.map((category) => category.money)),
  };
}

export async function readMonthView(month: string, currentMonth: string): Promise<MonthView> {
  const [accounts, transactions, allocations, transfers, budgets] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.allocations.toArray(),
    db.transfers.toArray(),
    db.budgets.toArray(),
  ]);
  return summarizeMonth(month, currentMonth, {
    accounts,
    transactions,
    allocations,
    transfers,
    budgets,
  });
}
