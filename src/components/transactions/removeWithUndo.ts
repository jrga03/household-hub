import { changeWithUndo } from "@/components/app/withUndo";
import type { Actor } from "@/lib/commands/accounts";
import { removeTransaction, restoreTransaction } from "@/lib/commands/transactions";
import { transactionLabel } from "@/lib/transactions/events";
import type { TransactionRow } from "@/lib/transactions/projection";
import { confirmRemoval } from "./confirmRemoval";

/**
 * Asks first, then removes the transaction, offering Undo (a restore event) in
 * the toast. Resolves whether it was removed.
 */
export async function removeWithUndo(actor: Actor, transaction: TransactionRow): Promise<boolean> {
  if (!(await confirmRemoval(transaction.description, transaction.amountCents))) return false;
  return changeWithUndo({
    change: () => removeTransaction(actor, transaction.id),
    undo: () => restoreTransaction(actor, transaction.id),
    done: `Removed ${transactionLabel(transaction)}`,
    failed: "Couldn't remove the transaction.",
    undoFailed: "Couldn't restore the transaction.",
  });
}
