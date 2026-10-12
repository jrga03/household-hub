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
  type BulkResult,
} from "@/lib/commands/transactions";
import type { TransactionRow } from "@/lib/transactions/projection";
import { errorMessage } from "@/lib/utils";

// Radix Select can't hold an empty value.
const UNASSIGNED = "unassigned";

export const countOf = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count.toLocaleString("en-PH")} ${many}`;

const transactionsCount = (count: number) => countOf(count, "transaction", "transactions");

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

function reportFailures(result: BulkResult) {
  const [first] = result.failed;
  if (!first) return;
  toast.error(`${transactionsCount(result.failed.length)} unchanged: ${first.reason}`);
}

interface BulkActionsProps {
  actor: Actor;
  /** The selected transactions still shown. */
  selected: TransactionRow[];
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
  const ids = selected.map((transaction) => transaction.id);

  const act = (run: () => Promise<BulkResult>, done: (result: BulkResult) => void) =>
    startActing(async () => {
      try {
        const result = await run();
        reportFailures(result);
        if (result.changed.length > 0) done(result);
        onDone();
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't change the transactions."));
      }
    });

  const markAs = (status: "cleared" | "pending") =>
    act(
      () => setTransactionsStatus(actor, ids, status),
      (result) => toast.success(`Marked ${transactionsCount(result.changed.length)} ${status}`)
    );

  const changeCategory = (value: string) =>
    act(
      () => changeTransactionsCategory(actor, ids, value === UNASSIGNED ? null : value),
      (result) =>
        toast.success(`Changed the category of ${transactionsCount(result.changed.length)}`)
    );

  const remove = () =>
    act(
      () => removeTransactions(actor, ids),
      (result) =>
        toast.success(`Removed ${transactionsCount(result.changed.length)}`, {
          action: {
            label: "Undo",
            onClick: () =>
              void restoreTransactions(actor, result.changed).then(
                reportFailures,
                (caught: unknown) =>
                  toast.error(errorMessage(caught, "Couldn't restore the transactions."))
              ),
          },
        })
    );

  const choices = categories ? categoriesFittingAll(categories, selected, accountsById) : [];

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
      <Select key={ids.join()} disabled={acting} onValueChange={changeCategory}>
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
