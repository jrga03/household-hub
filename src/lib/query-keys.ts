import type { AnalyticsFilters } from "@/hooks/useAnalytics";
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
