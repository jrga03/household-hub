/**
 * useDashboardData Hook
 *
 * Fetches all dashboard data in parallel using TanStack Query's useQueries.
 * This is more efficient than sequential fetches and provides a single loading state.
 *
 * Fetches:
 * - Recent transactions (last 10)
 * - Account balances
 * - Monthly spending summary
 * - Category breakdown
 *
 * Benefits:
 * - All queries run simultaneously (parallel)
 * - Single loading state (isLoading is true until ALL complete)
 * - Better performance than sequential queries
 * - Automatic caching and refetching per query
 *
 * @example
 * function Dashboard() {
 *   const { data, isLoading } = useDashboardData();
 *
 *   if (isLoading) return <Loading />;
 *
 *   const { transactions, accounts, spending, categories } = data;
 *   // ... render dashboard
 * }
 */

import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { startOfMonth, endOfMonth } from "date-fns";

export function useDashboardData() {
  const user = useAuthStore((state) => state.user);

  const currentMonth = new Date();
  const monthStart = startOfMonth(currentMonth).toISOString().split("T")[0];
  const monthEnd = endOfMonth(currentMonth).toISOString().split("T")[0];

  // Fetch all dashboard data in parallel
  const results = useQueries({
    queries: [
      // Recent transactions
      {
        queryKey: ["dashboard", "recent-transactions"],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("transactions")
            .select(
              `
              *,
              account:accounts(id, name),
              category:categories(id, name)
            `
            )
            .order("date", { ascending: false })
            .limit(10);

          if (error) throw error;
          return data;
        },
        enabled: !!user?.id,
        staleTime: 2 * 60 * 1000, // 2 minutes
      },

      // Account balances
      {
        queryKey: ["dashboard", "account-balances"],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("accounts")
            .select("id, name, balance_cents")
            .order("name");

          if (error) throw error;
          return data;
        },
        enabled: !!user?.id,
        staleTime: 5 * 60 * 1000, // 5 minutes
      },

      // Monthly spending summary
      {
        queryKey: ["dashboard", "monthly-spending", monthStart, monthEnd],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("transactions")
            .select("amount_cents, type")
            .gte("date", monthStart)
            .lte("date", monthEnd)
            .is("transfer_group_id", null); // Exclude transfers

          if (error) throw error;

          // Calculate totals
          const income = data
            .filter((t) => t.type === "income")
            .reduce((sum, t) => sum + t.amount_cents, 0);

          const expenses = data
            .filter((t) => t.type === "expense")
            .reduce((sum, t) => sum + t.amount_cents, 0);

          return {
            income,
            expenses,
            net: income - expenses,
            count: data.length,
          };
        },
        enabled: !!user?.id,
        staleTime: 5 * 60 * 1000, // 5 minutes
      },

      // Category breakdown (top 5 categories by spending)
      {
        queryKey: ["dashboard", "category-breakdown", monthStart, monthEnd],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("transactions")
            .select(
              `
              amount_cents,
              category:categories(id, name)
            `
            )
            .eq("type", "expense")
            .gte("date", monthStart)
            .lte("date", monthEnd)
            .is("transfer_group_id", null)
            .not("category_id", "is", null);

          if (error) throw error;

          // Group by category
          const categoryMap = data.reduce(
            (acc, t) => {
              // Supabase returns category as array or object depending on query
              const category = Array.isArray(t.category) ? t.category[0] : t.category;
              if (!category) return acc;

              const categoryName = category.name;
              if (!acc[categoryName]) {
                acc[categoryName] = 0;
              }
              acc[categoryName] += t.amount_cents;
              return acc;
            },
            {} as Record<string, number>
          );

          // Convert to array and sort by amount
          return Object.entries(categoryMap)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5); // Top 5
        },
        enabled: !!user?.id,
        staleTime: 5 * 60 * 1000, // 5 minutes
      },
    ],
  });

  const [transactionsQuery, accountsQuery, spendingQuery, categoriesQuery] = results;

  // Combined loading state - true if ANY query is loading
  const isLoading = results.some((result) => result.isLoading);

  // Combined error state - true if ANY query has error
  const hasError = results.some((result) => result.isError);

  // All queries successful
  const isSuccess = results.every((result) => result.isSuccess);

  return {
    data: {
      transactions: transactionsQuery.data || [],
      accounts: accountsQuery.data || [],
      spending: spendingQuery.data || { income: 0, expenses: 0, net: 0, count: 0 },
      categories: categoriesQuery.data || [],
    },
    isLoading,
    hasError,
    isSuccess,
    // Individual query states (in case you need them)
    queries: {
      transactions: transactionsQuery,
      accounts: accountsQuery,
      spending: spendingQuery,
      categories: categoriesQuery,
    },
  };
}
