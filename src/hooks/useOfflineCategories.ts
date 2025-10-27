import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cacheManager } from "@/lib/offline/cacheManager";
import { useOnlineStatus } from "./useOnlineStatus";
import type { LocalCategory } from "@/lib/dexie/db";

export function useOfflineCategories() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  const offlineQuery = useQuery({
    queryKey: ["categories", "offline"],
    queryFn: () => cacheManager.getCategories(),
    staleTime: Infinity,
    refetchOnMount: false,
  });

  const syncQuery = useQuery({
    queryKey: ["categories", "sync"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      const categories: LocalCategory[] = data.map((cat) => ({
        id: cat.id,
        household_id: cat.household_id,
        parent_id: cat.parent_id ?? undefined,
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        sort_order: cat.sort_order,
        is_active: cat.is_active,
        created_at: cat.created_at,
        updated_at: cat.updated_at,
      }));

      await cacheManager.cacheCategories(categories);
      // No await needed - TanStack Query handles this safely
      queryClient.invalidateQueries({ queryKey: ["categories", "offline"] });
      return categories;
    },
    enabled: isOnline,
    staleTime: 15 * 60 * 1000, // 15 minutes (rarely change)
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
