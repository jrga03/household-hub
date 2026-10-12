import { useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { Link } from "@tanstack/react-router";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
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
import { formatPHP, type Cents } from "@/lib/currency";
import type { TransactionStatus, TransactionType } from "@/lib/transactions/events";
import {
  filterTransactions,
  needsCategory,
  totalTransactions,
  type TransactionFilter,
} from "@/lib/transactions/filter";
import type { TransactionRow } from "@/lib/transactions/projection";
import { cn, errorMessage } from "@/lib/utils";
import { parseLocalDate } from "@/lib/utils/dates";
import { removeWithUndo } from "./removeWithUndo";
import { TransactionDialog } from "./TransactionDialog";
import { TransactionFilters } from "./TransactionFilters";

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

const ROW_HEIGHT_ESTIMATE = 61;

const formatCount = (count: number) => count.toLocaleString("en-PH");

/** "yyyy-MM" months holding transactions, newest first (the list is newest first). */
const monthsOf = (transactions: TransactionRow[]) => [
  ...new Set(transactions.map((transaction) => transaction.date.slice(0, 7))),
];

interface TransactionListProps {
  actor: Actor;
  filter: TransactionFilter;
  onFilterChange: (filter: TransactionFilter) => void;
}

/** Newest date first, filtered, with the totals of what's shown. */
export function TransactionList({ actor, filter, onFilterChange }: TransactionListProps) {
  const transactions = useTransactions();
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const categories = useCategoryList();
  const [editingId, setEditingId] = useState<string | null>(null);

  const shown = useMemo(
    () => (transactions ? filterTransactions(transactions, filter) : []),
    [transactions, filter]
  );
  const totals = useMemo(() => totalTransactions(shown), [shown]);
  const months = useMemo(() => monthsOf(transactions ?? []), [transactions]);
  const needingCategory = useMemo(
    () => (transactions ?? []).filter(needsCategory).length,
    [transactions]
  );

  if (!transactions) return null;

  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No transactions yet. Add one with the Add transaction button or by pressing n.
      </p>
    );
  }

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

  return (
    <>
      <TransactionFilters
        filter={filter}
        onChange={onFilterChange}
        months={months}
        accounts={accounts ?? []}
        retiredAccounts={retiredAccounts ?? []}
        categories={categories}
      />

      {needingCategory > 0 && !filter.needsCategory && (
        <p className="text-sm">
          <Link
            to="/transactions"
            search={{ needsCategory: true }}
            className="font-medium text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
          >
            {needingCategory === 1
              ? "1 expense needs a category"
              : `${formatCount(needingCategory)} expenses need a category`}
          </Link>
        </p>
      )}

      <section
        aria-label="Totals"
        className="grid grid-cols-3 gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
      >
        <Total label="Income" cents={totals.incomeCents} />
        <Total label="Expenses" cents={totals.expenseCents} />
        <Total label="Net" cents={totals.netCents} />
        <p className="col-span-3 text-xs text-muted-foreground">
          {shown.length === 1 ? "1 transaction" : `${formatCount(shown.length)} transactions`}
        </p>
      </section>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions match these filters.</p>
      ) : (
        <VirtualTransactionRows
          transactions={shown}
          renderRow={(transaction) => (
            <TransactionItem
              actor={actor}
              transaction={transaction}
              accountName={
                accountNames.get(transaction.accountId) ?? "Account not on this device yet"
              }
              categoryName={
                transaction.categoryId === null
                  ? "Unassigned"
                  : (categoryNames.get(transaction.categoryId) ?? "Category not on this device yet")
              }
              onEdit={() => setEditingId(transaction.id)}
            />
          )}
        />
      )}

      {editing && (
        <TransactionDialog actor={actor} transaction={editing} onClose={() => setEditingId(null)} />
      )}
    </>
  );
}

function Total({ label, cents }: { label: string; cents: Cents }) {
  return (
    <div role="group" aria-label={label} className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("truncate font-medium tabular-nums", cents < 0 && "text-destructive")}>
        {formatPHP(cents)}
      </p>
    </div>
  );
}

interface VirtualTransactionRowsProps {
  transactions: TransactionRow[];
  renderRow: (transaction: TransactionRow) => React.ReactNode;
}

/** Renders only the rows near the viewport; the page itself scrolls. */
function VirtualTransactionRows({ transactions, renderRow }: VirtualTransactionRowsProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Rows are placed from the top of the page, so track where the list starts.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setScrollMargin(list.getBoundingClientRect().top + window.scrollY);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: transactions.length,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 8,
    scrollMargin,
    getItemKey: (index) => transactions[index]?.id ?? index,
  });

  return (
    <ul
      ref={listRef}
      aria-label="Transactions"
      className="relative rounded-md border"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((item) => {
        const transaction = transactions[item.index];
        if (!transaction) return null;
        return (
          <li
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            aria-setsize={transactions.length}
            aria-posinset={item.index + 1}
            className="absolute left-0 top-0 w-full border-b last:border-b-0"
            style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
          >
            {renderRow(transaction)}
          </li>
        );
      })}
    </ul>
  );
}

interface TransactionItemProps {
  actor: Actor;
  transaction: TransactionRow;
  accountName: string;
  categoryName: string;
  onEdit: () => void;
}

function TransactionItem({
  actor,
  transaction,
  accountName,
  categoryName,
  onEdit,
}: TransactionItemProps) {
  const [changing, startChanging] = useTransition();
  const status = STATUS_DISPLAY[transaction.status];
  const amount = AMOUNT_DISPLAY[transaction.type];

  const toggleStatus = () =>
    startChanging(async () => {
      try {
        await setTransactionStatus(actor, transaction.id, status.toggleTo);
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't change the status."));
      }
    });

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        aria-label={`Edit ${transaction.description || categoryName}`}
        onClick={onEdit}
      >
        <p className="truncate font-medium">{transaction.description || categoryName}</p>
        <p className="truncate text-sm text-muted-foreground">
          {format(parseLocalDate(transaction.date), "MMM d, yyyy")} · {accountName}
          {transaction.description && ` · ${categoryName}`}
          {needsCategory(transaction) && " · Needs a category"}
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
        onClick={toggleStatus}
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
    </div>
  );
}
