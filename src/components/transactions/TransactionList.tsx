import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { useTransactions } from "@/hooks/useTransactions";
import type { Actor } from "@/lib/commands/accounts";
import { setTransactionStatus } from "@/lib/commands/transactions";
import { formatPHP } from "@/lib/currency";
import type { TransactionStatus, TransactionType } from "@/lib/transactions/events";
import type { TransactionRow } from "@/lib/transactions/projection";
import { errorMessage } from "@/lib/utils";
import { parseLocalDate } from "@/lib/utils/dates";
import { removeWithUndo } from "./removeWithUndo";
import { TransactionDialog } from "./TransactionDialog";

const STATUS_DISPLAY: Record<
  TransactionStatus,
  { label: string; toggleTo: TransactionStatus; badge: "secondary" | "outline" }
> = {
  cleared: { label: "Cleared", toggleTo: "pending", badge: "secondary" },
  pending: { label: "Pending", toggleTo: "cleared", badge: "outline" },
};

const AMOUNT_DISPLAY: Record<TransactionType, { sign: string; className: string }> = {
  income: { sign: "+", className: "tabular-nums text-green-700 dark:text-green-400" },
  expense: { sign: "−", className: "tabular-nums" },
};

/** Newest date first. */
export function TransactionList({ actor }: { actor: Actor }) {
  const transactions = useTransactions();
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const categories = useCategoryList();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [changing, startChanging] = useTransition();

  if (!transactions) return null;

  const accountNames = new Map(
    [...(accounts ?? []), ...(retiredAccounts ?? [])].map((account) => [account.id, account.name])
  );
  const categoryNames = new Map(
    categories
      ? [
          ...categories.groups.flatMap((group) => group.categories),
          ...categories.ungrouped,
          ...categories.retiredCategories,
        ].map((category) => [category.id, category.name])
      : []
  );
  const editing = transactions.find((transaction) => transaction.id === editingId);
  // Removed on another device mid-edit: drop it, so a restore doesn't reopen the dialog.
  if (editingId && !editing) setEditingId(null);

  const toggleStatus = (transaction: TransactionRow) =>
    startChanging(async () => {
      try {
        await setTransactionStatus(
          actor,
          transaction.id,
          STATUS_DISPLAY[transaction.status].toggleTo
        );
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't change the status."));
      }
    });

  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No transactions yet. Add one with the Add transaction button or by pressing n.
      </p>
    );
  }

  return (
    <>
      <ul aria-label="Transactions" className="divide-y rounded-md border">
        {transactions.map((transaction) => {
          const category =
            transaction.categoryId === null
              ? "Unassigned"
              : (categoryNames.get(transaction.categoryId) ?? "Category not on this device yet");
          const status = STATUS_DISPLAY[transaction.status];
          const amount = AMOUNT_DISPLAY[transaction.type];
          return (
            <li key={transaction.id} className="flex items-center gap-3 px-3 py-2">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                aria-label={`Edit ${transaction.description || category}`}
                onClick={() => setEditingId(transaction.id)}
              >
                <p className="truncate font-medium">{transaction.description || category}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {format(parseLocalDate(transaction.date), "MMM d, yyyy")} ·{" "}
                  {accountNames.get(transaction.accountId) ?? "Account not on this device yet"}
                  {transaction.description && ` · ${category}`}
                </p>
              </button>
              <span className={amount.className}>
                {amount.sign}
                {formatPHP(transaction.amountCents)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={changing}
                aria-label={`Mark ${status.toggleTo}`}
                onClick={() => toggleStatus(transaction)}
              >
                <Badge variant={status.badge}>{status.label}</Badge>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove"
                onClick={() => void removeWithUndo(actor, transaction)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>
      {editing && (
        <TransactionDialog actor={actor} transaction={editing} onClose={() => setEditingId(null)} />
      )}
    </>
  );
}
