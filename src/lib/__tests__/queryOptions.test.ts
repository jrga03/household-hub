import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import {
  accountBalanceQueryOptions,
  accountBalancesQueryOptions,
  accountsQueryOptions,
  budgetsQueryOptions,
  categoriesGroupedQueryOptions,
  categoriesQueryOptions,
  categoryTotalsQueryOptions,
  dashboardQueryOptions,
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
});
