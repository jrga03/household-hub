/**
 * The home's Finances section: the current month for Household accounts or
 * the member's Personal ones, never blended. Summed at read time from the
 * projections, so it is order-independent by construction.
 */

import type { AccountRow } from "@/lib/accounts/projection";
import { countsInMonth, summarizeMonth } from "@/lib/budgets/month";
import { budgetStatus, type BudgetStatus } from "@/lib/budgets/progress";
import type { BudgetLine } from "./attention";
import { ZERO_CENTS, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import { newestFirst, totalTransactions, type ListRow } from "@/lib/transactions/filter";
import { readMoneyRecords, sumAccountMoney } from "@/lib/transactions/money";
import { monthOfDate } from "@/lib/utils/dates";
import { shownIn, type FinanceView } from "./view";
import { byName } from "@/lib/utils/sort";

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
  /** The budgets counted above, for Needs attention. */
  budgetLines: BudgetLine[];
  /** The newest transactions and transfers, in any month. */
  latest: ListRow[];
}

const LATEST_COUNT = 5;

export async function readFinanceOverview(
  view: FinanceView,
  userId: string,
  currentMonth: string
): Promise<FinanceOverview> {
  const [records, budgets, categories] = await Promise.all([
    readMoneyRecords(),
    db.budgets.toArray(),
    db.categories.toArray(),
  ]);
  const { accounts, transactions, transfers } = records;
  const isShown = shownIn(view, userId);

  const shownTransactions = transactions.filter(
    (transaction) => !transaction.removed && isShown(transaction)
  );
  const shownTransfers = transfers.filter((transfer) => !transfer.removed && isShown(transfer));
  const thisMonth = shownTransactions.filter(
    (transaction) => monthOfDate(transaction.date) === currentMonth
  );
  const totals = totalTransactions(thisMonth);

  const money = sumAccountMoney(records);
  const balances = accounts
    .filter((account) => !account.retired && isShown(account))
    .sort(byName)
    .map((account) => ({ account, balance: money.get(account.id)?.balance ?? ZERO_CENTS }));

  const monthView = summarizeMonth(currentMonth, currentMonth, { ...records, budgets });
  const budgetCounts: BudgetStatusCounts = { fine: 0, close: 0, over: 0 };
  const budgetLines: BudgetLine[] = [];
  for (const category of categories) {
    const figures = monthView.get(category.id);
    // Budget's rows follow the same rule, so the two screens agree.
    if (!isShown(category) || !figures?.budget || !countsInMonth(category, figures)) continue;
    const budget = figures.budget.amountCents;
    budgetCounts[budgetStatus(budget, figures.spent)] += 1;
    budgetLines.push({
      categoryId: category.id,
      name: category.name,
      budget,
      spent: figures.spent,
    });
  }

  return {
    in: totals.incomeCents,
    out: totals.expenseCents,
    left: totals.netCents,
    balances,
    budgets: budgetCounts,
    budgetLines,
    latest: newestFirst(shownTransactions, shownTransfers).slice(0, LATEST_COUNT),
  };
}
