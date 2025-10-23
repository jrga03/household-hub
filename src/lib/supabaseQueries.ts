import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { Account, AccountInsert, AccountUpdate } from "@/types/accounts";

/**
 * TanStack Query hooks for accounts CRUD operations
 * See instructions.md Step 2 for full specification
 */

// Fetch all active accounts
export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data as Account[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Create account
export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (account: AccountInsert) => {
      const { data, error } = await supabase.from("accounts").insert(account).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

// Update account
export function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: AccountUpdate }) => {
      const { data, error } = await supabase
        .from("accounts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

// Archive account (soft delete)
export function useArchiveAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").update({ is_active: false }).eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

// TODO (Chunk 009): Calculate current balance from transactions
export function useAccountBalance(accountId: string) {
  return useQuery({
    queryKey: ["accountBalance", accountId],
    queryFn: async () => {
      // For now, just return initial balance
      const { data: account } = await supabase
        .from("accounts")
        .select("initial_balance_cents")
        .eq("id", accountId)
        .single();

      return account?.initial_balance_cents || 0;
    },
  });
}
