/**
 * usePrefetchTransactionData Hook
 *
 * Prefetches accounts and categories when the user lands on the transactions
 * page so the transaction form's dropdowns are warm before "Add Transaction".
 *
 * Uses the SAME query definitions as useAccounts/useCategories
 * (accountsQueryOptions / categoriesQueryOptions) so the prefetch cannot
 * poison their shared cache keys with a different queryFn (review DATA-06).
 *
 * @example
 * function TransactionsPage() {
 *   usePrefetchTransactionData();
 *   // ... rest of component
 * }
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { accountsQueryOptions, categoriesQueryOptions } from "@/lib/supabaseQueries";

export function usePrefetchTransactionData() {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.prefetchQuery(accountsQueryOptions());
    queryClient.prefetchQuery(categoriesQueryOptions());
  }, [queryClient]);
}
