import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cacheManager } from "@/lib/offline/cacheManager";
import { useOnlineStatus } from "./useOnlineStatus";
import type { LocalAccount } from "@/lib/dexie/db";

export function useOfflineAccounts() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  const offlineQuery = useQuery({
    queryKey: ["accounts", "offline"],
    queryFn: () => cacheManager.getAccounts(),
    staleTime: Infinity,
    refetchOnMount: false,
  });

  const syncQuery = useQuery({
    queryKey: ["accounts", "sync"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      const accounts: LocalAccount[] = data.map((acc) => ({
        id: acc.id,
        household_id: acc.household_id,
        name: acc.name,
        type: acc.type as "bank" | "investment" | "credit_card" | "cash",
        initial_balance_cents: acc.initial_balance_cents,
        currency_code: acc.currency_code,
        visibility: acc.visibility as "household" | "personal",
        owner_user_id: acc.owner_user_id ?? undefined,
        color: acc.color,
        icon: acc.icon,
        sort_order: acc.sort_order,
        is_active: acc.is_active,
        created_at: acc.created_at,
        updated_at: acc.updated_at,
      }));

      await cacheManager.cacheAccounts(accounts);
      // No await needed - TanStack Query handles this safely
      queryClient.invalidateQueries({ queryKey: ["accounts", "offline"] });
      return accounts;
    },
    enabled: isOnline,
    staleTime: 10 * 60 * 1000, // 10 minutes (less frequent than transactions)
    refetchOnReconnect: true,
  });

  return {
    data: offlineQuery.data || [],
    isLoading: offlineQuery.isLoading,
    isSyncing: syncQuery.isFetching,
    error: offlineQuery.error || syncQuery.error,
    isOnline,
  };
}
