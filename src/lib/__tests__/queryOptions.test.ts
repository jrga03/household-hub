import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import {
  accountBalanceQueryOptions,
  accountBalancesQueryOptions,
  accountsQueryOptions,
  categoriesGroupedQueryOptions,
  categoriesQueryOptions,
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
});
