import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { analyticsQueryOptions } from "@/hooks/useAnalytics";
import { transfersQueryOptions } from "@/hooks/useTransfers";
import {
  accountBalanceQueryOptions,
  accountBalancesQueryOptions,
  accountsQueryOptions,
  activeExternalDebtsQueryOptions,
  budgetsQueryOptions,
  categoriesGroupedQueryOptions,
  categoriesQueryOptions,
  categoryTotalsQueryOptions,
  dashboardQueryOptions,
  transactionQueryOptions,
  transactionsFilterSummaryQueryOptions,
  transactionsInfiniteQueryOptions,
} from "@/lib/supabaseQueries";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

// Pins cache identity: each builder must key its query with the factory key.
describe("query options builders", () => {
  it("accounts", () => {
    expect(accountsQueryOptions().queryKey).toEqual(queryKeys.accounts.list());
    expect(accountBalanceQueryOptions("a1").queryKey).toEqual(queryKeys.accounts.balance("a1"));
    expect(accountBalancesQueryOptions().queryKey).toEqual(queryKeys.accounts.balances());
  });

  it("categories", () => {
    expect(categoriesQueryOptions().queryKey).toEqual(queryKeys.categories.list());
    expect(categoriesGroupedQueryOptions().queryKey).toEqual(queryKeys.categories.grouped());
  });

  it("month-keyed reads", () => {
    const october = new Date(2026, 9, 15);
    expect(categoryTotalsQueryOptions(october).queryKey).toEqual(
      queryKeys.categoryTotals.month("2026-10")
    );
    expect(dashboardQueryOptions(october).queryKey).toEqual(queryKeys.dashboard.month("2026-10"));
    expect(budgetsQueryOptions(october).queryKey).toEqual(queryKeys.budgets.month("2026-10"));
  });

  it("analytics, transfers, debts selector", () => {
    const filters = { accountId: "a1" };
    expect(
      analyticsQueryOptions(new Date(2026, 0, 1), new Date(2026, 9, 31), filters).queryKey
    ).toEqual(queryKeys.analytics.range("2026-01-01", "2026-10-31", filters));
    expect(transfersQueryOptions("hh-1").queryKey).toEqual(queryKeys.transfers.list("hh-1"));
    expect(activeExternalDebtsQueryOptions().queryKey).toEqual(
      queryKeys.debts.activeExternal("00000000-0000-0000-0000-000000000001")
    );
    expect(activeExternalDebtsQueryOptions().staleTime).toBe(0);
  });

  it("transactions", () => {
    const filters = { search: "rice" };
    expect(transactionsInfiniteQueryOptions(filters).queryKey).toEqual(
      queryKeys.transactions.list(filters)
    );
    expect(transactionsFilterSummaryQueryOptions(filters).queryKey).toEqual(
      queryKeys.transactions.filterSummary(filters)
    );
    expect(transactionQueryOptions("t1").queryKey).toEqual(queryKeys.transactions.detail("t1"));
  });
});
