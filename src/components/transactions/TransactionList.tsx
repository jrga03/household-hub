import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Link } from "@tanstack/react-router";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { ArrowLeftRight, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { useTransactionListRows } from "@/hooks/useTransactions";
import { categoryNames, envelopeLabel } from "@/components/allocations/envelopes";
import type { Actor } from "@/lib/commands/accounts";
import { setTransactionStatus } from "@/lib/commands/transactions";
import { setTransferStatus } from "@/lib/commands/transfers";
import { formatPHP, type Cents } from "@/lib/currency";
import type { TransactionStatus } from "@/lib/transactions/events";
import {
  filterTransactions,
  isTransfer,
  needsCategory,
  totalTransactions,
  transferDirection,
  type ListRow,
  type TransactionFilter,
} from "@/lib/transactions/filter";
import { cn, countOf, errorMessage } from "@/lib/utils";
import { parseLocalDate } from "@/lib/utils/dates";
import { BulkActions } from "./BulkActions";
import { SAVED_LOCALLY } from "./EntryFields";
import { removeWithUndo } from "./removeWithUndo";
import { TransactionDialog, TransactionEditor } from "./TransactionDialog";
import { removeTransferWithUndo, TransferDialog, TransferEditor } from "./TransferDialog";
import { TransactionFilters } from "./TransactionFilters";
import { SWIPE_THRESHOLD, useSwipe } from "./useSwipe";

const STATUS_DISPLAY: Record<
  TransactionStatus,
  { label: string; toggleTo: TransactionStatus; badge: "secondary" | "outline" }
> = {
  cleared: { label: "Cleared", toggleTo: "pending", badge: "secondary" },
  pending: { label: "Pending", toggleTo: "cleared", badge: "outline" },
};

interface AmountDisplay {
  sign: string;
  className: string;
}

const MONEY_IN: AmountDisplay = {
  sign: "+",
  className: "tabular-nums text-green-700 dark:text-green-400",
};
const MONEY_OUT: AmountDisplay = { sign: "−", className: "tabular-nums" };
const MONEY_MOVED: AmountDisplay = { sign: "", className: "tabular-nums text-muted-foreground" };

const ROW_HEIGHT_ESTIMATE = 61;

// The shell header is sticky and h-14.
const BELOW_HEADER = "top-[calc(3.5rem+var(--safe-area-top))]";
const PANE_MAX_HEIGHT = "max-h-[calc(100dvh-3.5rem-2rem-var(--safe-area-top))]";

/** Whether the element is laid out: the pane is `hidden` below its breakpoint. */
function useLaidOut(element: HTMLElement | null) {
  const [laidOut, setLaidOut] = useState(false);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setLaidOut((entry?.contentRect.width ?? 0) > 0)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return laidOut;
}

/** "yyyy-MM" months holding transactions or transfers, newest first (the list is newest first). */
const monthsOf = (rows: ListRow[]) => [...new Set(rows.map((row) => row.date.slice(0, 7)))];

/** What a row shows: its name, the line beneath it and how its amount reads. */
interface RowDisplay {
  label: string;
  detail: string;
  amount: AmountDisplay;
}

interface TransactionListProps {
  actor: Actor;
  filter: TransactionFilter;
  onFilterChange: (filter: TransactionFilter) => void;
}

/**
 * Transactions and transfers, newest date first, filtered, with the totals of
 * what's shown. A transfer is one row for both legs, signed when an account is
 * filtered. A row opens in the detail pane on wide screens and in a dialog otherwise.
 */
export function TransactionList({ actor, filter, onFilterChange }: TransactionListProps) {
  const transactions = useTransactionListRows();
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const categories = useCategoryList();
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pane, setPane] = useState<HTMLElement | null>(null);
  const paneShown = useLaidOut(pane);
  // A new filter starts a new selection, so hidden rows don't come back selected.
  const [selectionFilter, setSelectionFilter] = useState(filter);
  if (selectionFilter !== filter) {
    setSelectionFilter(filter);
    setSelectedIds(new Set());
  }

  const shown = useMemo(
    () => (transactions ? filterTransactions(transactions, filter) : []),
    [transactions, filter]
  );
  const selected = useMemo(
    () => shown.filter((transaction) => selectedIds.has(transaction.id)),
    [shown, selectedIds]
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
      <PageShell.Main className="@[1100px]:col-span-full">
        <p className="text-sm text-muted-foreground">
          No transactions yet. Add one with the Add transaction button or by pressing n.
        </p>
      </PageShell.Main>
    );
  }

  const allAccounts = [...(accounts ?? []), ...(retiredAccounts ?? [])];
  const accountsById = new Map(allAccounts.map((account) => [account.id, account]));
  const namesOfCategories = categories ? categoryNames(categories) : new Map<string, string>();
  const accountNameOf = (accountId: string) =>
    accountsById.get(accountId)?.name ?? "Account not on this device yet";
  const date = (row: ListRow) => format(parseLocalDate(row.date), "MMM d, yyyy");
  const display = (row: ListRow): RowDisplay => {
    if (isTransfer(row)) {
      const path = `${accountNameOf(row.fromAccountId)} → ${accountNameOf(row.toAccountId)}`;
      const envelope = envelopeLabel(
        row.envelope,
        namesOfCategories,
        new Map(allAccounts.map((account) => [account.id, account.name]))
      );
      const direction = transferDirection(row, filter.account);
      return {
        label: row.description || path,
        detail: [date(row), row.description && path, envelope].filter(Boolean).join(" · "),
        amount: direction === "in" ? MONEY_IN : direction === "out" ? MONEY_OUT : MONEY_MOVED,
      };
    }
    const categoryName =
      row.categoryId === null
        ? "Unassigned"
        : (namesOfCategories.get(row.categoryId) ?? "Category not on this device yet");
    return {
      label: row.description || categoryName,
      detail: [
        date(row),
        accountNameOf(row.accountId),
        row.description && categoryName,
        needsCategory(row) && "Needs a category",
      ]
        .filter(Boolean)
        .join(" · "),
      amount: row.type === "income" ? MONEY_IN : MONEY_OUT,
    };
  };
  const openTransaction = transactions.find((transaction) => transaction.id === openId);
  // Removed on another device mid-edit: drop it, so a restore doesn't reopen it.
  if (openId && !openTransaction) setOpenId(null);
  const paneTitle =
    openTransaction && isTransfer(openTransaction) ? "Edit transfer" : "Edit transaction";

  const toggleSelected = (id: string, isSelected: boolean) =>
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  const allShownSelected = selected.length === shown.length;
  const transfersShown = shown.filter(isTransfer).length;
  const activeFilters = Object.keys(filter).length;

  return (
    <>
      <PageShell.Main className="space-y-4">
        {/* Phones show the rows first; the filters wait behind a button. */}
        <Button
          variant="outline"
          size="sm"
          className="@[600px]:hidden"
          aria-expanded={filtersOpen}
          aria-controls="transaction-filters"
          onClick={() => setFiltersOpen((wasOpen) => !wasOpen)}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Search and filters{activeFilters > 0 && ` (${activeFilters})`}
        </Button>
        <div id="transaction-filters" className={cn(!filtersOpen && "hidden @[600px]:block")}>
          <TransactionFilters
            filter={filter}
            onChange={onFilterChange}
            months={months}
            accounts={allAccounts}
            categories={categories}
          />
        </div>

        {needingCategory > 0 && !filter.needsCategory && (
          <p className="text-sm">
            <Link
              to="/transactions"
              search={{ needsCategory: true }}
              className="font-medium text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
            >
              {countOf(needingCategory, "expense needs a category", "expenses need a category")}
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
            {countOf(shown.length - transfersShown, "transaction", "transactions")}
            {transfersShown > 0 &&
              `, ${countOf(transfersShown, "transfer", "transfers")} (not in the totals)`}
          </p>
        </section>

        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions match these filters.</p>
        ) : (
          <>
            <div
              className={cn(
                "sticky z-20 -mx-1 flex flex-wrap items-center gap-3 bg-background px-1 py-2",
                BELOW_HEADER
              )}
            >
              <div className="flex items-center gap-2 px-3">
                <Checkbox
                  id="select-all-shown"
                  checked={allShownSelected ? true : selected.length > 0 ? "indeterminate" : false}
                  onCheckedChange={(checked) =>
                    setSelectedIds(
                      checked === true
                        ? new Set(shown.map((transaction) => transaction.id))
                        : new Set()
                    )
                  }
                />
                <label htmlFor="select-all-shown" className="text-sm">
                  Select all shown
                </label>
              </div>
              {selected.length > 0 && (
                <div className="min-w-0 basis-full @[600px]:basis-0 @[600px]:flex-1">
                  <BulkActions
                    actor={actor}
                    selected={selected}
                    accountsById={accountsById}
                    categories={categories}
                    onDone={() => setSelectedIds(new Set())}
                  />
                </div>
              )}
            </div>

            <VirtualTransactionRows
              actor={actor}
              transactions={shown}
              selectedIds={selectedIds}
              openId={openId}
              display={display}
              onOpen={setOpenId}
              onSelectedChange={toggleSelected}
            />
          </>
        )}
      </PageShell.Main>

      <PageShell.RightAside ref={setPane} className="hidden @[1100px]:block">
        <div
          className={cn(
            "@container sticky overflow-y-auto rounded-md border p-4",
            BELOW_HEADER,
            PANE_MAX_HEIGHT
          )}
        >
          {openTransaction && paneShown ? (
            <section aria-label={paneTitle} className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{paneTitle}</h2>
                  <p className="text-sm text-muted-foreground">{SAVED_LOCALLY}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
                  Close
                </Button>
              </div>
              {/* Keyed, so the form's defaults follow the row picked. */}
              {isTransfer(openTransaction) ? (
                <TransferEditor
                  key={openTransaction.id}
                  actor={actor}
                  transfer={openTransaction}
                  onClose={() => setOpenId(null)}
                />
              ) : (
                <TransactionEditor
                  key={openTransaction.id}
                  actor={actor}
                  transaction={openTransaction}
                  onClose={() => setOpenId(null)}
                />
              )}
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose a transaction to see and edit it here.
            </p>
          )}
        </div>
      </PageShell.RightAside>

      {openTransaction &&
        !paneShown &&
        (isTransfer(openTransaction) ? (
          <TransferDialog
            actor={actor}
            transfer={openTransaction}
            onClose={() => setOpenId(null)}
          />
        ) : (
          <TransactionDialog
            actor={actor}
            transaction={openTransaction}
            onClose={() => setOpenId(null)}
          />
        ))}
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
  actor: Actor;
  transactions: ListRow[];
  selectedIds: ReadonlySet<string>;
  openId: string | null;
  display: (row: ListRow) => RowDisplay;
  onOpen: (id: string) => void;
  onSelectedChange: (id: string, selected: boolean) => void;
}

/** Renders only the rows near the viewport; the page itself scrolls. */
function VirtualTransactionRows({
  actor,
  transactions,
  selectedIds,
  openId,
  display,
  onOpen,
  onSelectedChange,
}: VirtualTransactionRowsProps) {
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
    // Stable across renders, so the virtualizer keeps its measured offsets.
    getItemKey: useCallback((index: number) => transactions[index]?.id ?? index, [transactions]),
  });

  return (
    <ul
      ref={listRef}
      aria-label="Transactions"
      className="relative overflow-hidden rounded-md border"
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
            <TransactionItem
              actor={actor}
              row={transaction}
              display={display(transaction)}
              selected={selectedIds.has(transaction.id)}
              open={transaction.id === openId}
              onOpen={() => onOpen(transaction.id)}
              onSelectedChange={(selected) => onSelectedChange(transaction.id, selected)}
            />
          </li>
        );
      })}
    </ul>
  );
}

interface TransactionItemProps {
  actor: Actor;
  row: ListRow;
  display: RowDisplay;
  selected: boolean;
  open: boolean;
  onOpen: () => void;
  onSelectedChange: (selected: boolean) => void;
}

/**
 * On phones a swipe right toggles the status and a swipe left removes; the
 * status button, the dialog's Remove and the bulk actions do the same by
 * keyboard or screen reader.
 */
function TransactionItem({
  actor,
  row,
  display,
  selected,
  open,
  onOpen,
  onSelectedChange,
}: TransactionItemProps) {
  const [changing, startChanging] = useTransition();
  const status = STATUS_DISPLAY[row.status];
  const { label, detail, amount } = display;

  const toggleStatus = () =>
    startChanging(async () => {
      try {
        if (isTransfer(row)) await setTransferStatus(actor, row.id, status.toggleTo);
        else await setTransactionStatus(actor, row.id, status.toggleTo);
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't change the status."));
      }
    });
  const remove = () =>
    void (isTransfer(row) ? removeTransferWithUndo(actor, row) : removeWithUndo(actor, row));
  const { offset, handlers } = useSwipe({
    onSwipeRight: () => !changing && toggleStatus(),
    onSwipeLeft: remove,
  });

  return (
    <div className="relative">
      {offset !== 0 && (
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0 flex items-center px-4 text-sm font-medium text-white",
            offset > 0 ? "justify-start bg-green-700" : "justify-end bg-destructive",
            Math.abs(offset) < SWIPE_THRESHOLD && "opacity-60"
          )}
        >
          {offset > 0 ? `Mark ${status.toggleTo}` : "Remove"}
        </div>
      )}
      <div
        {...handlers}
        className={cn(
          "relative flex touch-pan-y items-center gap-3 bg-background px-3 py-2",
          selected && "bg-muted",
          open && "bg-accent ring-2 ring-inset ring-ring"
        )}
        style={offset === 0 ? undefined : { transform: `translateX(${offset}px)` }}
      >
        <Checkbox
          checked={selected}
          aria-label={`Select ${label}`}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
        />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-label={`Edit ${label}`}
          aria-current={open || undefined}
          onClick={onOpen}
        >
          <p className="flex items-center gap-1.5 truncate font-medium">
            {isTransfer(row) && (
              <ArrowLeftRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-label="Transfer"
              />
            )}
            <span className="truncate">{label}</span>
          </p>
          <p className="truncate text-sm text-muted-foreground">{detail}</p>
        </button>
        <span className={amount.className}>
          {amount.sign}
          {formatPHP(row.amountCents)}
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
          className="hidden @[600px]:inline-flex"
          onClick={remove}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
