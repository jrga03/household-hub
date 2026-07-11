import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/dexie/deviceManager";
import { isLikelyNetworkError } from "@/lib/offline/reads";
import { getLocalTransfers, groupTransferLegs, type TransferLeg } from "@/lib/offline/transfers";

export function useCreateTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      from_account_id,
      to_account_id,
      from_account_name,
      to_account_name,
      amount_cents,
      date,
      description,
      household_id,
      user_id,
    }: {
      from_account_id: string;
      to_account_id: string;
      from_account_name: string;
      to_account_name: string;
      amount_cents: number;
      date: string;
      description: string;
      household_id: string;
      user_id: string;
    }) => {
      const transfer_group_id = crypto.randomUUID();
      const device_id = await getDeviceId(); // Use hybrid device ID strategy

      // Create expense (from account)
      // Use user's description if provided, otherwise use default
      const expenseDescription = description || `Transfer to ${to_account_name}`;
      const incomeDescription = description || `Transfer from ${from_account_name}`;

      // Both legs in one statement: PostgREST wraps a multi-row insert in a
      // single database transaction, so a transfer can never be half-created.
      const { error } = await supabase.from("transactions").insert([
        {
          household_id,
          account_id: from_account_id,
          date,
          description: expenseDescription,
          amount_cents,
          type: "expense",
          transfer_group_id,
          created_by_user_id: user_id,
          device_id,
        },
        {
          household_id,
          account_id: to_account_id,
          date,
          description: incomeDescription,
          amount_cents,
          type: "income",
          transfer_group_id,
          created_by_user_id: user_id,
          device_id,
        },
      ]);

      if (error) throw error;

      return { transfer_group_id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] }); // Balances updated
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
