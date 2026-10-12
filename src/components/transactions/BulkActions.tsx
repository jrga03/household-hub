import { useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountRow } from "@/lib/accounts/projection";
import { canHoldMoneyIn, type CategoryList, type CategoryRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import {
  changeTransactionsCategory,
  removeTransactions,
  restoreTransactions,
  setTransactionsStatus,
} from "@/lib/commands/transactions";
import type { BulkResult } from "@/lib/commands/bulk";
import { removeTransfers, restoreTransfers, setTransfersStatus } from "@/lib/commands/transfers";
import { isTransfer, type ListRow } from "@/lib/transactions/filter";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { TransactionStatus } from "@/lib/transactions/events";
import { countOf, errorMessage } from "@/lib/utils";

// Radix Select can't hold an empty value.
const UNASSIGNED = "unassigned";

/** "5 transactions", "1 transfer" or "2 transactions and 1 transfer". */
function rowsCount(ids: string[], rows: ListRow[]): string {
  const counted = rows.filter((row) => ids.includes(row.id));
  const transfers = counted.filter(isTransfer).length;
  const transactions = ids.length - transfers;
  const parts = [
    transactions > 0 || transfers === 0
      ? countOf(transactions, "transaction", "transactions")
      : null,
    transfers > 0 ? countOf(transfers, "transfer", "transfers") : null,
  ];
  return parts.filter((part) => part !== null).join(" and ");
}

const bothResults = (a: BulkResult, b: BulkResult): BulkResult => ({
  changed: [...a.changed, ...b.changed],
  failed: [...a.failed, ...b.failed],
});

/** Runs the transaction and transfer commands on their own part of the selection. */
async function onEach(
  rows: ListRow[],
  onTransactions: (ids: string[]) => Promise<BulkResult>,
  onTransfers: (ids: string[]) => Promise<BulkResult>
): Promise<BulkResult> {
  const transactionIds = rows.filter((row) => !isTransfer(row)).map((row) => row.id);
  const transferIds = rows.filter(isTransfer).map((row) => row.id);
  return bothResults(await onTransactions(transactionIds), await onTransfers(transferIds));
}

/** Categories in use that every selected transaction's account can hold money in, by group. */
function categoriesFittingAll(
  list: CategoryList,
  selected: TransactionRow[],
  accountsById: Map<string, AccountRow>
): { label: string; categories: CategoryRow[] }[] {
  const accounts = selected.map((transaction) => accountsById.get(transaction.accountId));
  const fits = (category: CategoryRow) =>
    accounts.every((account) => account !== undefined && canHoldMoneyIn(category, account));
  return [
    ...list.groups.map((group) => ({
      label: group.name,
      categories: group.categories.filter(fits),
    })),
    { label: "Ungrouped", categories: list.ungrouped.filter(fits) },
  ].filter((group) => group.categories.length > 0);
}

function reportFailures(result: BulkResult, rows: ListRow[]) {
  const [first] = result.failed;
  if (!first) return;
  const failedIds = result.failed.map((failure) => failure.id);
  toast.error(`${rowsCount(failedIds, rows)} unchanged: ${first.reason}`);
}

interface BulkActionsProps {
  actor: Actor;
  /** The selected transactions and transfers still shown. */
  selected: ListRow[];
  accountsById: Map<string, AccountRow>;
  categories: CategoryList | undefined;
  onDone: () => void;
}

export function BulkActions({
  actor,
  selected,
  accountsById,
  categories,
  onDone,
}: BulkActionsProps) {
  const [acting, startActing] = useTransition();
  const ids = selected.map((row) => row.id);
  // Transfers carry an envelope on both sides; Change category skips them.
  const transactions = selected.filter((row): row is TransactionRow => !isTransfer(row));
  const transactionIds = transactions.map((transaction) => transaction.id);

  const runBulk = (
    command: () => Promise<BulkResult>,
    onChanged: (result: BulkResult) => void,
    alreadyMessage: string
  ) =>
    startActing(async () => {
      try {
        const result = await command();
        reportFailures(result, selected);
        if (result.changed.length > 0) onChanged(result);
        else if (result.failed.length === 0) toast.info(alreadyMessage);
        // Kept when nothing could change, so the member can retry.
        if (result.changed.length > 0 || result.failed.length === 0) onDone();
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't change the transactions."));
      }
    });

  const markAs = (status: TransactionStatus) =>
    runBulk(
      () =>
        onEach(
          selected,
          (some) => setTransactionsStatus(actor, some, status),
          (some) => setTransfersStatus(actor, some, status)
        ),
      (result) => toast.success(`Marked ${rowsCount(result.changed, selected)} ${status}`),
      `They're already ${status}.`
    );

  const changeCategory = (value: string) =>
    runBulk(
      () => changeTransactionsCategory(actor, transactionIds, value === UNASSIGNED ? null : value),
      (result) =>
        toast.success(
          `Changed the category of ${countOf(result.changed.length, "transaction", "transactions")}`
        ),
      "They're already in that category."
    );

  const remove = () =>
    runBulk(
      () =>
        onEach(
          selected,
          (some) => removeTransactions(actor, some),
          (some) => removeTransfers(actor, some)
        ),
      (result) =>
        toast.success(`Removed ${rowsCount(result.changed, selected)}`, {
          action: {
            label: "Undo",
            onClick: () =>
              void onEach(
                selected.filter((row) => result.changed.includes(row.id)),
                (some) => restoreTransactions(actor, some),
                (some) => restoreTransfers(actor, some)
              ).then(
                (restored) => reportFailures(restored, selected),
                (caught: unknown) =>
                  toast.error(errorMessage(caught, "Couldn't restore the transactions."))
              ),
          },
        }),
      "They're already removed."
    );

  const choices = categories ? categoriesFittingAll(categories, transactions, accountsById) : [];

  return (
    <div
      role="toolbar"
      aria-label="Selected transactions"
      className="flex flex-wrap items-center gap-2"
    >
      <p className="mr-auto text-sm font-medium" aria-live="polite">
        {selected.length.toLocaleString("en-PH")} selected
      </p>
      <Button size="sm" variant="outline" disabled={acting} onClick={() => markAs("cleared")}>
        Mark cleared
      </Button>
      <Button size="sm" variant="outline" disabled={acting} onClick={() => markAs("pending")}>
        Mark pending
      </Button>
      {/* Keyed by the selection, so it shows its placeholder again after each change. */}
      <Select
        key={ids.join()}
        disabled={acting || transactions.length === 0}
        onValueChange={changeCategory}
      >
        <SelectTrigger size="sm" aria-label="Change category" className="w-40">
          <SelectValue placeholder="Change category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          {choices.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={acting} onClick={remove}>
        Remove
      </Button>
      <Button size="icon" variant="ghost" aria-label="Clear selection" onClick={onDone}>
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
