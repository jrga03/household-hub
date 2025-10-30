import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";

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

      const { error: expenseError } = await supabase.from("transactions").insert({
        household_id,
        account_id: from_account_id,
        date,
        description: expenseDescription,
        amount_cents,
        type: "expense",
        transfer_group_id,
        created_by_user_id: user_id,
        device_id,
      });

      if (expenseError) throw expenseError;

      // Create income (to account)
      const { error: incomeError } = await supabase.from("transactions").insert({
        household_id,
        account_id: to_account_id,
        date,
        description: incomeDescription,
        amount_cents,
        type: "income",
        transfer_group_id,
        created_by_user_id: user_id,
        device_id,
      });

      if (incomeError) throw incomeError;

      return { transfer_group_id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] }); // Balances updated
    },
  });
}

// NOTE: Transaction Atomicity
// This implementation uses sequential inserts without explicit transaction wrapping.
// The database triggers from chunk 017 (handle_transfer_deletion) will clean up
// orphaned transactions if the second insert fails by setting transfer_group_id to NULL.
//
// For production enhancement, consider:
// - Option A: PostgreSQL function with BEGIN/COMMIT transaction wrapper
// - Option B: Supabase RPC function that atomically creates both transactions
//
// Current approach is acceptable for MVP as database triggers provide eventual consistency.

export function useTransfers(householdId: string) {
  return useQuery({
    queryKey: ["transfers", householdId],
    queryFn: async () => {
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

      // Group transactions by transfer_group_id on the client side
      // This is fast and avoids multiple database queries
      type TransferTransaction = {
        id: string;
        date: string;
        amount_cents: number;
        description: string;
        transfer_group_id: string | null;
        type: string;
        account: { id: string; name: string } | null;
      };

      const transferGroups = new Map<
        string,
        {
          expense: TransferTransaction | null;
          income: TransferTransaction | null;
        }
      >();

      data?.forEach((transaction) => {
        const groupId = transaction.transfer_group_id!;

        if (!transferGroups.has(groupId)) {
          transferGroups.set(groupId, { expense: null, income: null });
        }

        const group = transferGroups.get(groupId)!;
        if (transaction.type === "expense") {
          group.expense = transaction;
        } else {
          group.income = transaction;
        }
      });

      // Build final result with only complete pairs
      // Filter out incomplete pairs (safety check for data integrity)
      return Array.from(transferGroups.values())
        .filter((g) => g.expense && g.income) // Only show complete transfer pairs
        .map((g) => ({
          id: g.expense!.id,
          date: g.expense!.date,
          amount_cents: g.expense!.amount_cents,
          transfer_group_id: g.expense!.transfer_group_id,
          description: g.expense!.description,
          from_account: g.expense!.account,
          to_account: g.income!.account,
          from_account_name: g.expense!.account?.name || "Unknown",
          to_account_name: g.income!.account?.name || "Unknown",
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },
    staleTime: 30 * 1000, // Cache for 30 seconds - transfers don't change frequently
  });
}
