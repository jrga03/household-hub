/**
 * Shared single-transaction delete flow.
 *
 * Confirms with the user (transfer-aware message, app-level AlertDialog via
 * `@/lib/confirm` — review R39), reverses any linked debt payment FIRST, then
 * deletes the transaction, then invalidates debt queries and toasts. Used by
 * TransactionList's per-row Delete button and the narrow-layout detail sheet
 * (mobile UX review R38) so the two entry points cannot drift.
 */

import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { confirm } from "@/lib/confirm";
import { handleTransactionDelete } from "@/lib/debts";

interface ConfirmAndDeleteTransactionArgs {
  id: string;
  description: string;
  /** Transfers delete BOTH legs; the confirm copy must say so. */
  isTransferLeg: boolean;
  /**
   * The `useDeleteTransaction().mutateAsync` function, injected so callers
   * share the app's single mutation path (list/account invalidation included).
   */
  deleteTransaction: (id: string) => Promise<void>;
  queryClient: QueryClient;
}

/** @returns true when the transaction was deleted, false when cancelled or failed */
export async function confirmAndDeleteTransaction({
  id,
  description,
  isTransferLeg,
  deleteTransaction,
  queryClient,
}: ConfirmAndDeleteTransactionArgs): Promise<boolean> {
  const confirmed = await confirm({
    title: isTransferLeg
      ? `Delete transfer "${description}"?`
      : `Delete transaction "${description}"?`,
    description: isTransferLeg
      ? "Both sides of this transfer will be deleted to keep account balances consistent."
      : "This will also reverse any debt payments linked to this transaction.",
    confirmLabel: "Delete",
    destructive: true,
  });
  if (!confirmed) return false;

  try {
    // Reverse debt payment FIRST (if linked)
    const reversalResult = await handleTransactionDelete({ transaction_id: id });

    // Then delete transaction
    await deleteTransaction(id);

    // Invalidate debt queries if payment was reversed
    if (reversalResult) {
      queryClient.invalidateQueries({ queryKey: ["debts"] });
      queryClient.invalidateQueries({ queryKey: ["debt-balance"] });
      toast.success("Transaction deleted and debt balance restored");
    } else {
      toast.success("Transaction deleted");
    }
    return true;
  } catch (error) {
    console.error("Failed to delete:", error);
    toast.error(error instanceof Error ? error.message : "Failed to delete transaction");
    return false;
  }
}
