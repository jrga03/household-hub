import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cacheManager } from "@/lib/offline/cacheManager";
import { useOnlineStatus } from "./useOnlineStatus";
import type { LocalTransaction } from "@/lib/dexie/db";

/**
 * Read-from-IndexedDB-first hook for transactions
 *
 * Pattern:
 * 1. Return IndexedDB data immediately (instant)
 * 2. Fetch from Supabase in background (if online)
 * 3. Update IndexedDB cache with fresh data
 */
export function useOfflineTransactions() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  // Query 1: Offline-first read (instant)
  const offlineQuery = useQuery({
    queryKey: ["transactions", "offline"],
    queryFn: async () => {
      // Read from IndexedDB
      const transactions = await cacheManager.getTransactions();
      return transactions;
    },
    staleTime: Infinity, // IndexedDB is truth when offline
    refetchOnMount: false,
  });

  // Query 2: Background sync (only when online)
  const syncQuery = useQuery({
    queryKey: ["transactions", "sync"],
    queryFn: async () => {
      // Fetch from Supabase
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;

      // Map Supabase data to LocalTransaction format
      const transactions: LocalTransaction[] = data.map((tx) => ({
        id: tx.id,
        household_id: tx.household_id,
        date: tx.date,
        description: tx.description,
        amount_cents: tx.amount_cents,
        type: tx.type as "income" | "expense",
        currency_code: tx.currency_code,
        account_id: tx.account_id ?? undefined,
        category_id: tx.category_id ?? undefined,
        status: tx.status as "pending" | "cleared",
        visibility: tx.visibility as "household" | "personal",
        created_by_user_id: tx.created_by_user_id,
        tagged_user_ids: tx.tagged_user_ids ?? [],
        transfer_group_id: tx.transfer_group_id ?? undefined,
        notes: tx.notes ?? undefined,
        device_id: tx.device_id,
        created_at: tx.created_at,
        updated_at: tx.updated_at,
      }));

      // Cache in IndexedDB
      await cacheManager.cacheTransactions(transactions);

      // Invalidate offline query to trigger re-render with fresh data
      // No await needed - TanStack Query handles this safely
      queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });

      return transactions;
    },
    enabled: isOnline, // Only run when online
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  return {
    data: offlineQuery.data || [],
    isLoading: offlineQuery.isLoading,
    isSyncing: syncQuery.isFetching,
    error: offlineQuery.error || syncQuery.error,
    isOnline,
  };
}
