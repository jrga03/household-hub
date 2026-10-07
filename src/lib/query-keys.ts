import { hashKey, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { AnalyticsFilters } from "@/hooks/useAnalytics";
import type { EntityType } from "@/types/sync";
import type { TransactionFilters } from "@/types/transactions";

/**
 * Every TanStack Query key in the app. Keys nest under one root per entity so
 * invalidating `x.all` clears everything about x. Data derived from several
 * entities (dashboard, budgets, totals, analytics) keeps its own root and is
 * reached through invalidatesAfterWrite.
 */
export const queryKeys = {
  transactions: {
    all: ["transactions"] as const,
    list: (filters?: TransactionFilters) => ["transactions", "list", filters] as const,
    filterSummary: (filters?: TransactionFilters) =>
      ["transactions", "filter-summary", filters] as const,
    detail: (id: string) => ["transactions", "detail", id] as const,
  },
  accounts: {
    all: ["accounts"] as const,
    list: () => ["accounts", "list"] as const,
    balances: () => ["accounts", "balances"] as const,
    balance: (id: string) => ["accounts", "balances", id] as const,
  },
  categories: {
    all: ["categories"] as const,
    list: () => ["categories", "list"] as const,
    grouped: () => ["categories", "grouped"] as const,
  },
  budgets: {
    all: ["budgets"] as const,
    month: (yyyyMM: string) => ["budgets", yyyyMM] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    month: (yyyyMM: string) => ["dashboard", yyyyMM] as const,
  },
  categoryTotals: {
    all: ["category-totals"] as const,
    month: (yyyyMM: string) => ["category-totals", yyyyMM] as const,
  },
  analytics: {
    all: ["analytics"] as const,
    range: (startDate: string, endDate: string, filters?: AnalyticsFilters) =>
      ["analytics", startDate, endDate, filters] as const,
  },
  transfers: {
    all: ["transfers"] as const,
    list: (householdId: string) => ["transfers", householdId] as const,
  },
  debts: {
    all: ["debts"] as const,
    activeExternal: (householdId: string) => ["debts", householdId, "external", "active"] as const,
  },
};

/**
 * What goes stale when an entity is written, derived from the tables each
 * fetcher reads. Exhaustive over EntityType: a new entity fails to compile
 * until it says what it invalidates. Checked by query-keys.test.ts.
 */
export const invalidatesAfterWrite = {
  transaction: [
    queryKeys.transactions.all,
    queryKeys.accounts.balances(),
    queryKeys.categoryTotals.all,
    queryKeys.dashboard.all,
    queryKeys.budgets.all,
    queryKeys.analytics.all,
    queryKeys.transfers.all,
    queryKeys.debts.all,
  ],
  account: [
    queryKeys.accounts.all,
    queryKeys.transactions.all,
    queryKeys.dashboard.all,
    queryKeys.analytics.all,
    queryKeys.transfers.all,
  ],
  category: [
    queryKeys.categories.all,
    queryKeys.transactions.all,
    queryKeys.categoryTotals.all,
    queryKeys.dashboard.all,
    queryKeys.budgets.all,
    queryKeys.analytics.all,
  ],
  budget: [queryKeys.budgets.all, queryKeys.analytics.all],
  debt: [queryKeys.debts.all],
  internal_debt: [queryKeys.debts.all],
  debt_payment: [queryKeys.debts.all],
} satisfies Record<EntityType, readonly QueryKey[]>;

export function keysAfterWrite(entities: EntityType | readonly EntityType[]): QueryKey[] {
  const list: readonly EntityType[] = typeof entities === "string" ? [entities] : entities;
  const byHash = new Map<string, QueryKey>();
  for (const entity of list) {
    for (const key of invalidatesAfterWrite[entity]) byHash.set(hashKey(key), key);
  }
  return [...byHash.values()];
}

/** Off-screen queries are only marked stale (refetchType "active"), so broad entries are cheap. */
export function invalidateAfterWrite(
  queryClient: QueryClient,
  entities: EntityType | readonly EntityType[]
): void {
  for (const queryKey of keysAfterWrite(entities)) {
    queryClient.invalidateQueries({ queryKey }).catch(() => {});
  }
}
