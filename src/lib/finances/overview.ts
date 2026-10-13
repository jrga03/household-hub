/**
 * The home's Finances section: the current month for Household accounts or
 * the member's Personal ones, never blended. Summed at read time from the
 * projections, so it is order-independent by construction.
 */

import type { AccountRow } from "@/lib/accounts/projection";
import { summarizeMonth } from "@/lib/budgets/month";
import { budgetStatus, type BudgetStatus } from "@/lib/budgets/progress";
import { ZERO_CENTS, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import type { Ownership } from "@/lib/events/log";
import { newestFirst, totalTransactions, type ListRow } from "@/lib/transactions/filter";
import { sumAccountMoney } from "@/lib/transactions/money";
import { monthOfDate } from "@/lib/utils/dates";

export type FinanceView = "household" | "mine";

/** Categories with a budget this month, by how much of it is spent: close from 80%, over past 100%. */
export type BudgetStatusCounts = Record<BudgetStatus, number>;

export interface FinanceOverview {
  in: Cents;
  out: Cents;
  /** In minus out; negative when more went out. */
  left: Cents;
  /** Accounts in use, by name; for a credit card, the amount owed. */
  balances: { account: AccountRow; balance: Cents }[];
  budgets: BudgetStatusCounts;
  /** The newest transactions and transfers, in any month. */
  latest: ListRow[];
}

const LATEST_COUNT = 5;

/** Household, or Personal and the member's own. */
const shownIn = (view: FinanceView, userId: string) => (owned: Ownership) =>
  view === "household"
    ? owned.visibility === "household"
    : owned.visibility === "personal" && owned.ownerUserId === userId;

export async function readFinanceOverview(
  view: FinanceView,
  userId: string,
  currentMonth: string
): Promise<FinanceOverview> {
  const [accounts, transactions, allocations, transfers, budgets, categories] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.allocations.toArray(),
    db.transfers.toArray(),
    db.budgets.toArray(),
    db.categories.toArray(),
  ]);
  const isShown = shownIn(view, userId);

  const shownTransactions = transactions.filter(
    (transaction) => !transaction.removed && isShown(transaction)
  );
  const shownTransfers = transfers.filter((transfer) => !transfer.removed && isShown(transfer));
  const thisMonth = shownTransactions.filter(
    (transaction) => monthOfDate(transaction.date) === currentMonth
  );
  const totals = totalTransactions(thisMonth);

  const money = sumAccountMoney(accounts, transactions, allocations, transfers);
  const balances = accounts
    .filter((account) => !account.retired && isShown(account))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((account) => ({ account, balance: money.get(account.id)?.balance ?? ZERO_CENTS }));

  const monthView = summarizeMonth(currentMonth, currentMonth, {
    accounts,
    transactions,
    allocations,
    transfers,
    budgets,
  });
  const budgetCounts: BudgetStatusCounts = { fine: 0, close: 0, over: 0 };
  for (const category of categories) {
    const figures = monthView.get(category.id);
    if (category.retired || !isShown(category) || !figures?.budget) continue;
    budgetCounts[budgetStatus(figures.budget.amountCents, figures.spent)] += 1;
  }

  return {
    in: totals.incomeCents,
    out: totals.expenseCents,
    left: totals.netCents,
    balances,
    budgets: budgetCounts,
    latest: newestFirst(shownTransactions, shownTransfers).slice(0, LATEST_COUNT),
  };
}
