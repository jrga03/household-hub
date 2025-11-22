/**
 * usePrefetchTransactionData Hook
 *
 * Prefetches accounts and categories when user navigates to transactions page.
 * This ensures dropdowns/selects load instantly when opening the transaction form.
 *
 * Benefits:
 * - Parallel loading (accounts + categories simultaneously)
 * - Cached data ready before user clicks "Add Transaction"
 * - Reduces perceived latency when opening form
 *
 * @example
 * function TransactionsPage() {
 *   usePrefetchTransactionData();
 *   // ... rest of component
 * }
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function usePrefetchTransactionData() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Prefetch accounts (likely needed for transaction form)
    queryClient.prefetchQuery({
      queryKey: ["accounts"],
      queryFn: async () => {
        const { data, error } = await supabase.from("accounts").select("*").order("name");

        if (error) throw error;
        return data;
      },
      staleTime: 10 * 60 * 1000, // 10 minutes
    });

    // Prefetch categories (likely needed for transaction form)
    queryClient.prefetchQuery({
      queryKey: ["categories"],
      queryFn: async () => {
        const { data, error } = await supabase.from("categories").select("*").order("name");

        if (error) throw error;
        return data;
      },
      staleTime: 10 * 60 * 1000, // 10 minutes
    });
  }, [queryClient]);
}
