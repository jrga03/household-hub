import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTransferLegs } from "@/lib/supabaseQueries";
import { isLikelyNetworkError } from "@/lib/offline/reads";
import { afterOutboxWrite } from "@/lib/offline/afterWrite";
import {
  createOfflineTransfer,
  getLocalTransfers,
  groupTransferLegs,
  type TransferInput,
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
      afterOutboxWrite(queryClient, variables.user_id, [
        ["transactions"],
        ["transfers"],
        ["accounts"],
      ]);
    },
  });
}

export function useTransfers(householdId: string) {
  return useQuery({
    queryKey: ["transfers", householdId],
    queryFn: async () => {
      try {
        // Pairing lives in offline/transfers.ts (groupTransferLegs) so the
        // server path and the Dexie fallback can never drift (review R11)
        return groupTransferLegs(await fetchTransferLegs(householdId));
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
