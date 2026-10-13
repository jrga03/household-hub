import { toast } from "sonner";
import type { Actor } from "@/lib/commands/accounts";
import { removeTransaction, restoreTransaction } from "@/lib/commands/transactions";
import { transactionLabel } from "@/lib/transactions/events";
import type { TransactionRow } from "@/lib/transactions/projection";
import { errorMessage } from "@/lib/utils";
import { confirmRemoval } from "./confirmRemoval";

/**
 * Asks first, then removes the transaction, offering Undo (a restore event) in
 * the toast. Resolves whether it was removed.
 */
export async function removeWithUndo(actor: Actor, transaction: TransactionRow): Promise<boolean> {
  if (!(await confirmRemoval(transaction.description, transaction.amountCents))) return false;
  try {
    await removeTransaction(actor, transaction.id);
  } catch (caught) {
    toast.error(errorMessage(caught, "Couldn't remove the transaction."));
    return false;
  }
  toast.success(`Removed ${transactionLabel(transaction)}`, {
    action: {
      label: "Undo",
      onClick: () =>
        void restoreTransaction(actor, transaction.id).catch((caught: unknown) =>
          toast.error(errorMessage(caught, "Couldn't restore the transaction."))
        ),
    },
  });
  return true;
}
