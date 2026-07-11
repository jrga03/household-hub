/**
 * Local dashboard aggregates computed from Dexie (review R11)
 *
 * Offline fallback for useDashboardData (lib/supabaseQueries.ts): every
 * number the dashboard shows is recomputed here from the local mirrors
 * (db.transactions / db.accounts / db.categories) with EXACTLY the same
 * semantics as the server queries:
 *
 * - Analytics (income/expense/net, category breakdown, monthly trend)
 *   EXCLUDE transfers (`transfer_group_id` set), matching the server's
 *   `.is("transfer_group_id", null)` clauses.
 * - Balances INCLUDE transfers and both statuses (cleared + pending),
 *   matching the get_account_balances RPC.
 * - Month boundaries are date-fns startOfMonth/endOfMonth formatted as
 *   "yyyy-MM-dd" and compared against the transaction DATE string, matching
 *   the server's gte/lte range on the DATE column.
 * - Recent transactions include transfers (the server's recent query has no
 *   transfer filter) and join account/category from the local mirrors.
 *
 * All amounts are BIGINT cents throughout.
 *
 * @module offline/aggregates
 */

import { startOfMonth, endOfMonth, format, subMonths } from "date-fns";
import { db, type LocalTransaction } from "@/lib/dexie/db";

/** Result shape mirroring DashboardData in lib/supabaseQueries.ts. */
export interface LocalDashboardData {
  summary: {
    totalIncomeCents: number;
    totalExpenseCents: number;
    netAmountCents: number;
    transactionCount: number;
    accountCount: number;
    totalBalanceCents: number;
    previousMonthIncomeCents: number;
    previousMonthExpenseCents: number;
    activeDays: number;
    uniqueCategories: number;
    clearedCount: number;
    pendingCount: number;
  };
  monthlyTrend: Array<{
    month: string;
    incomeCents: number;
    expenseCents: number;
  }>;
  categoryBreakdown: Array<{
    categoryId: string;
    categoryName: string;
    color: string;
    amountCents: number;
    percentOfTotal: number;
  }>;
  recentTransactions: Array<
    LocalTransaction & {
      account: { id: string; name: string } | null;
      category: { id: string; name: string; color: string } | null;
    }
  >;
}

/**
 * True when the local mirrors contain ANY financial data. Used to
 * distinguish "offline but we can serve device data" from a genuinely
 * empty device (fresh install that has never synced), where computed
 * all-zero aggregates would be a false dashboard.
 */
export async function hasLocalFinancialData(): Promise<boolean> {
  const [transactionCount, accountCount] = await Promise.all([
    db.transactions.count(),
    db.accounts.count(),
  ]);
  return transactionCount > 0 || accountCount > 0;
}

/**
 * Computes the full dashboard payload from Dexie, mirroring
 * useDashboardData's server-side computation field for field.
 */
export async function getLocalDashboardData(currentMonth: Date): Promise<LocalDashboardData> {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const previousMonthStart = startOfMonth(subMonths(currentMonth, 1));
  const previousMonthEnd = endOfMonth(subMonths(currentMonth, 1));
  const sixMonthsAgo = subMonths(monthStart, 5);

  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");
  const previousStartStr = format(previousMonthStart, "yyyy-MM-dd");
  const previousEndStr = format(previousMonthEnd, "yyyy-MM-dd");
  const trendStartStr = format(sixMonthsAgo, "yyyy-MM-dd");

  const [allTransactions, allAccounts, allCategories] = await Promise.all([
    db.transactions.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
  ]);

  const activeAccounts = allAccounts.filter((a) => a.is_active);
  const activeCategories = allCategories.filter((c) => c.is_active);

  // Analytics rows: EXCLUDE transfers (server: .is("transfer_group_id", null))
  const nonTransfer = allTransactions.filter((t) => !t.transfer_group_id);

  const currentTransactions = nonTransfer.filter(
    (t) => t.date >= monthStartStr && t.date <= monthEndStr
  );
  const previousTransactions = nonTransfer.filter(
    (t) => t.date >= previousStartStr && t.date <= previousEndStr
  );
  const trendTransactions = nonTransfer.filter(
    (t) => t.date >= trendStartStr && t.date <= monthEndStr
  );

  // Summary (same reduce semantics as the server)
  const totalIncome = currentTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount_cents, 0);
  const totalExpense = currentTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount_cents, 0);
  const previousIncome = previousTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount_cents, 0);
  const previousExpense = previousTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount_cents, 0);

  const uniqueDates = new Set(currentTransactions.map((t) => t.date));
  const uniqueCategoryIds = new Set(
    currentTransactions.filter((t) => t.category_id).map((t) => t.category_id)
  );
  const clearedCount = currentTransactions.filter((t) => t.status === "cleared").length;
  const pendingCount = currentTransactions.filter((t) => t.status === "pending").length;

  // Balances: INCLUDE transfers and both statuses (get_account_balances RPC
  // semantics) - income adds, expense subtracts, per account, all history
  const deltaByAccount = new Map<string, number>();
  for (const t of allTransactions) {
    if (!t.account_id) continue;
    const signed = t.type === "income" ? t.amount_cents : -t.amount_cents;
    deltaByAccount.set(t.account_id, (deltaByAccount.get(t.account_id) ?? 0) + signed);
  }
  const totalBalance = activeAccounts.reduce(
    (sum, account) =>
      sum + (account.initial_balance_cents || 0) + (deltaByAccount.get(account.id) ?? 0),
    0
  );

  // Monthly trend (same 6-month loop and month-key derivation as the server)
  const monthlyTrend: Array<{ month: string; incomeCents: number; expenseCents: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const month = subMonths(currentMonth, i);
    const monthKey = format(month, "yyyy-MM");
    const monthTransactions = trendTransactions.filter(
      (t) => format(new Date(t.date), "yyyy-MM") === monthKey
    );

    const income = monthTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount_cents, 0);
    const expense = monthTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount_cents, 0);

    monthlyTrend.push({ month: format(month, "MMM"), incomeCents: income, expenseCents: expense });
  }

  // Category breakdown: current-month expenses only, top 10 (server parity)
  const categoryTotals = new Map<string, number>();
  currentTransactions
    .filter((t) => t.type === "expense" && t.category_id)
    .forEach((t) => {
      const existing = categoryTotals.get(t.category_id!) || 0;
      categoryTotals.set(t.category_id!, existing + t.amount_cents);
    });

  const categoryBreakdown = Array.from(categoryTotals.entries())
    .map(([categoryId, amount]) => {
      const category = activeCategories.find((c) => c.id === categoryId);
      return {
        categoryId,
        categoryName: category?.name || "Unknown",
        color: category?.color || "#6B7280",
        amountCents: amount,
        percentOfTotal: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
      };
    })
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 10);

  // Recent transactions: last 10 by date desc / created_at desc, INCLUDING
  // transfers (the server's recent query has no transfer filter), joined
  // like the Supabase select from the local mirrors
  const accountById = new Map(allAccounts.map((a) => [a.id, { id: a.id, name: a.name }]));
  const categoryById = new Map(
    allCategories.map((c) => [c.id, { id: c.id, name: c.name, color: c.color }])
  );
  const recentTransactions = [...allTransactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
    .slice(0, 10)
    .map((t) => ({
      ...t,
      account: t.account_id ? (accountById.get(t.account_id) ?? null) : null,
      category: t.category_id ? (categoryById.get(t.category_id) ?? null) : null,
    }));

  return {
    summary: {
      totalIncomeCents: totalIncome,
      totalExpenseCents: totalExpense,
      netAmountCents: totalIncome - totalExpense,
      transactionCount: currentTransactions.length,
      accountCount: activeAccounts.length,
      totalBalanceCents: totalBalance,
      previousMonthIncomeCents: previousIncome,
      previousMonthExpenseCents: previousExpense,
      activeDays: uniqueDates.size,
      uniqueCategories: uniqueCategoryIds.size,
      clearedCount,
      pendingCount,
    },
    monthlyTrend,
    categoryBreakdown,
    recentTransactions,
  };
}
