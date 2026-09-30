import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { isLikelyNetworkError } from "@/lib/offline/reads";
import { syncProcessor } from "@/lib/sync/processor";
import {
  createOfflineTransfer,
  getLocalTransfers,
  groupTransferLegs,
  type TransferInput,
  type TransferLeg,
} from "@/lib/offline/transfers";

export function useCreateTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ user_id, ...transfer }: TransferInput & { user_id: string }) => {
      const result = await createOfflineTransfer(transfer, user_id);
      if (!result.success) {
        throw new Error(result.error ?? "Failed to create transfer");
      }
      return result.data ?? [];
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] }); // Balances updated

      // Fire-and-forget outbox drain so the transfer shows up in "Recent
      // Transfers" right away instead of waiting for the next sync trigger
      // (same pattern as TransactionFormDialog). Skipped offline.
      if (navigator.onLine) {
        syncProcessor
          .processQueue(variables.user_id)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["transfers"] });
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
          })
          .catch(() => {});
      }
    },
  });
}

export function useTransfers(householdId: string) {
  return useQuery({
    queryKey: ["transfers", householdId],
    queryFn: async () => {
      try {
        // OPTIMIZED: Fetch ALL transfer transactions in a single query
        // This eliminates the N+1 query problem (was 1 + N queries, now just 1)
        const { data, error } = await supabase
          .from("transactions")
          .select(
            `
          id,
          date,
          amount_cents,
          description,
          transfer_group_id,
          type,
          account:accounts!transactions_account_id_fkey(id, name)
        `
          )
          .eq("household_id", householdId)
          .not("transfer_group_id", "is", null)
          .order("date", { ascending: false });

        if (error) throw error;

        // Pairing lives in offline/transfers.ts (groupTransferLegs) so the
        // server path and the Dexie fallback can never drift (review R11)
        const legs: TransferLeg[] = (data ?? []).map((transaction) => {
          // Supabase joins return arrays; extract the first element for single-record joins
          const accountData = Array.isArray(transaction.account)
            ? (transaction.account[0] ?? null)
            : transaction.account;

          return {
            id: transaction.id,
            date: transaction.date,
            amount_cents: transaction.amount_cents,
            description: transaction.description,
            transfer_group_id: transaction.transfer_group_id,
            type: transaction.type,
            account: accountData ? { id: accountData.id, name: accountData.name } : null,
          };
        });

        return groupTransferLegs(legs);
      } catch (error) {
        // Offline fallback (review R11): the same transfer pairs read from
        // the local Dexie mirror (transfer_group_id NOT NULL), grouped by
        // the exact same pairing function
        if (isLikelyNetworkError(error)) {
          console.warn("[useTransfers] Network unavailable - reading from Dexie");
          return getLocalTransfers(householdId);
        }
        throw error;
      }
    },
    staleTime: 30 * 1000, // Cache for 30 seconds - transfers don't change frequently
    networkMode: "always", // run the queryFn offline so the Dexie fallback can serve
  });
}
