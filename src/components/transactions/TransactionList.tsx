import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultRangeExtractor, useWindowVirtualizer, type Range } from "@tanstack/react-virtual";
import { SlidersHorizontal } from "lucide-react";
import { ContextMode } from "@/components/layout/ContextMode";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { PageShell } from "@/components/layout/PageShell";
import { BELOW_HEADER, PANE_MAX_HEIGHT } from "@/components/layout/pane";
import { Button } from "@/components/ui/button";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { useLaidOut } from "@/hooks/useLaidOut";
import { useTransactionListRows } from "@/hooks/useTransactions";
import { categoryNames } from "@/components/allocations/envelopes";
import type { Actor } from "@/lib/commands/accounts";
import { dateHeading, groupByDate, type DateGroupItem } from "@/lib/transactions/date-groups";
import {
  filterTransactions,
  isCorrection,
  isTransfer,
  type ListRow,
  type TransactionFilter,
} from "@/lib/transactions/filter";
import { CorrectionDetails, CorrectionDialog } from "@/components/corrections/CorrectionDialog";
import { CORRECTION_LABEL } from "@/lib/corrections/events";
import { cn } from "@/lib/utils";
import { monthOfDate } from "@/lib/utils/dates";
import { SAVED_LOCALLY } from "./EntryFields";
import { SelectionActions } from "./SelectionActions";
import { TransactionDialog, TransactionEditor } from "./TransactionDialog";
import { rowDisplay } from "./rowDisplay";
import { TransactionItem } from "./TransactionItem";
import { TransferDialog, TransferEditor } from "./TransferDialog";
import { TransactionFilters } from "./TransactionFilters";
import type { RevealedAction } from "./useRowGestures";
import { useCloseWhenGone } from "@/hooks/useCloseWhenGone";

const ROW_HEIGHT_ESTIMATE = 61;
const HEADING_HEIGHT_ESTIMATE = 31;

/** "yyyy-MM" months holding transactions or transfers, newest first (the list is newest first). */
const monthsOf = (rows: ListRow[]) => [...new Set(rows.map((row) => monthOfDate(row.date)))];

interface TransactionListProps {
  actor: Actor;
  filter: TransactionFilter;
  onFilterChange: (filter: TransactionFilter) => void;
  expenseInParentheses?: boolean;
}

/**
 * Transactions, transfers and balance corrections under their dates, newest
 * first, filtered. A transfer is one row for both legs, signed when an account
 * is filtered. A row
 * opens in the detail pane on wide screens and in a sheet otherwise. A long
 * press or the header's Select starts selecting.
 */
export function TransactionList({
  actor,
  filter,
  onFilterChange,
  expenseInParentheses = false,
}: TransactionListProps) {
  const rows = useTransactionListRows();
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const categories = useCategoryList();
  const [openId, setOpenId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [revealed, setRevealed] = useState<{ id: string; action: RevealedAction } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pane, setPane] = useState<HTMLElement | null>(null);
  const paneShown = useLaidOut(pane);
  // A new filter starts a new selection, so hidden rows don't come back selected.
  const [selectionFilter, setSelectionFilter] = useState(filter);
  if (selectionFilter !== filter) {
    setSelectionFilter(filter);
    setSelectedIds(new Set());
  }

  const shown = useMemo(() => (rows ? filterTransactions(rows, filter) : []), [rows, filter]);
  const items = useMemo(() => groupByDate(shown), [shown]);
  const selected = useMemo(
    () => shown.filter((row) => selectedIds.has(row.id)),
    [shown, selectedIds]
  );
  const months = useMemo(() => monthsOf(rows ?? []), [rows]);
  const openRow = rows?.find((row) => row.id === openId);
  useCloseWhenGone(openId, rows && (openRow ?? null), () => setOpenId(null));

  if (!rows) return null;

  if (rows.length === 0) {
    return (
      <PageShell.Main className="@[1100px]:col-span-full">
        <p className="text-body text-muted-foreground">
          No transactions yet. Add one with the Add transaction button or by pressing n.
        </p>
      </PageShell.Main>
    );
  }

  const allAccounts = [...(accounts ?? []), ...(retiredAccounts ?? [])];
  const accountsById = new Map(allAccounts.map((account) => [account.id, account]));
  const names = {
    categories: categories ? categoryNames(categories) : new Map<string, string>(),
    accounts: new Map(allAccounts.map((account) => [account.id, account.name])),
  };
  const paneTitle = !openRow
    ? "Edit transaction"
    : isCorrection(openRow)
      ? CORRECTION_LABEL
      : isTransfer(openRow)
        ? "Edit transfer"
        : "Edit transaction";

  const startSelecting = (firstId?: string) => {
    setSelecting(true);
    setOpenId(null);
    setRevealed(null);
    setSelectedIds(new Set(firstId ? [firstId] : []));
  };
  const stopSelecting = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };
  const toggleSelected = (id: string) =>
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const revealRow = (id: string, action: RevealedAction | null) =>
    setRevealed((current) => (action ? { id, action } : current?.id === id ? null : current));
  const allShownSelected = shown.length > 0 && selected.length === shown.length;
  const activeFilters = Object.keys(filter).length;

  return (
    <>
      <HeaderActions>
        {selecting ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={shown.length === 0}
            onClick={() =>
              setSelectedIds(allShownSelected ? new Set() : new Set(shown.map((row) => row.id)))
            }
          >
            {allShownSelected ? "Select none" : "Select all"}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={shown.length === 0}
            onClick={() => startSelecting()}
          >
            Select
          </Button>
        )}
      </HeaderActions>

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

        {shown.length === 0 ? (
          <p className="text-body text-muted-foreground">No transactions match these filters.</p>
        ) : (
          <VirtualTransactionRows
            items={items}
            renderRow={(row) => (
              <TransactionItem
                actor={actor}
                row={row}
                display={rowDisplay(row, names, filter.account)}
                open={row.id === openId}
                selecting={selecting}
                selected={selectedIds.has(row.id)}
                revealed={revealed?.id === row.id ? revealed.action : null}
                onRevealChange={(action) => revealRow(row.id, action)}
                onTap={() => (selecting ? toggleSelected(row.id) : setOpenId(row.id))}
                onLongPress={() => (selecting ? toggleSelected(row.id) : startSelecting(row.id))}
                expenseInParentheses={expenseInParentheses}
              />
            )}
          />
        )}

        {selecting && (
          <ContextMode
            title={`${selected.length.toLocaleString("en-PH")} selected`}
            exitLabel="Cancel selection"
            onExit={stopSelecting}
            inlineClassName="sticky bottom-4 z-20 rounded-md border bg-background shadow-float"
          >
            <SelectionActions
              actor={actor}
              selected={selected}
              accountsById={accountsById}
              categories={categories}
              onDone={stopSelecting}
            />
          </ContextMode>
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
          {openRow && paneShown ? (
            <section aria-label={paneTitle} className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{paneTitle}</h2>
                  <p className="text-body text-muted-foreground">{SAVED_LOCALLY}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
                  Close
                </Button>
              </div>
              {/* Keyed, so the form's defaults follow the row picked. */}
              {isCorrection(openRow) ? (
                <CorrectionDetails
                  key={openRow.id}
                  actor={actor}
                  correction={openRow}
                  onClose={() => setOpenId(null)}
                />
              ) : isTransfer(openRow) ? (
                <TransferEditor
                  key={openRow.id}
                  actor={actor}
                  transfer={openRow}
                  onClose={() => setOpenId(null)}
                />
              ) : (
                <TransactionEditor
                  key={openRow.id}
                  actor={actor}
                  transaction={openRow}
                  onClose={() => setOpenId(null)}
                />
              )}
            </section>
          ) : (
            <p className="text-body text-muted-foreground">
              Choose a transaction to see and edit it here.
            </p>
          )}
        </div>
      </PageShell.RightAside>

      {openRow &&
        !paneShown &&
        (isCorrection(openRow) ? (
          <CorrectionDialog actor={actor} correction={openRow} onClose={() => setOpenId(null)} />
        ) : isTransfer(openRow) ? (
          <TransferDialog actor={actor} transfer={openRow} onClose={() => setOpenId(null)} />
        ) : (
          <TransactionDialog actor={actor} transaction={openRow} onClose={() => setOpenId(null)} />
        ))}
    </>
  );
}

interface VirtualTransactionRowsProps {
  items: DateGroupItem<ListRow>[];
  renderRow: (row: ListRow) => ReactNode;
}

/**
 * Renders only the items near the viewport; the page itself scrolls. The
 * heading of the date in view sticks under the shell header.
 */
function VirtualTransactionRows({ items, renderRow }: VirtualTransactionRowsProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [listTop, setListTop] = useState(0);
  // How far below the top of the window the headings stick: the shell header's height.
  const [stickyTop, setStickyTop] = useState(0);
  const headingIndexes = useMemo(
    () => items.flatMap((item, index) => (item.kind === "date" ? [index] : [])),
    [items]
  );
  const headingAbove = useCallback(
    (index: number) => headingIndexes.findLast((heading) => heading <= index) ?? 0,
    [headingIndexes]
  );
  const today = new Date();

  // Rows are placed from the top of the page, so track where the list starts.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setListTop(list.getBoundingClientRect().top + window.scrollY);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  // Counted from below the shell header, so the next date slides over the stuck one and takes
  // over once it reaches the top.
  const scrollMargin = listTop - stickyTop;
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: (index) =>
      items[index]?.kind === "date" ? HEADING_HEIGHT_ESTIMATE : ROW_HEIGHT_ESTIMATE,
    overscan: 8,
    scrollMargin,
    // Stable across renders, so the virtualizer keeps its measured offsets.
    getItemKey: useCallback(
      (index: number) => {
        const item = items[index];
        if (!item) return index;
        return item.kind === "date" ? `date-${item.date}` : item.row.id;
      },
      [items]
    ),
    rangeExtractor: useCallback(
      (range: Range) =>
        [...new Set([headingAbove(range.startIndex), ...defaultRangeExtractor(range)])].sort(
          (a, b) => a - b
        ),
      [headingAbove]
    ),
  });
  const virtualItems = virtualizer.getVirtualItems();
  const stuckIndex = headingAbove(virtualizer.range?.startIndex ?? 0);
  const measureStuckHeading = useCallback(
    (heading: HTMLElement | null) => {
      virtualizer.measureElement(heading);
      if (!heading) return;
      // eslint-disable-next-line arch/no-ad-hoc-money-parse -- a CSS length in px, not an amount
      setStickyTop(parseFloat(window.getComputedStyle(heading).top) || 0);
    },
    [virtualizer]
  );

  return (
    <ul
      ref={listRef}
      aria-label="Transactions"
      className="relative rounded-md border"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualItems.map((virtualItem) => {
        const item = items[virtualItem.index];
        if (!item) return null;
        const placed = { transform: `translateY(${virtualItem.start - scrollMargin}px)` };
        if (item.kind === "date") {
          const stuck = virtualItem.index === stuckIndex;
          return (
            <li
              key={virtualItem.key}
              ref={stuck ? measureStuckHeading : virtualizer.measureElement}
              // A heading, not one of the transactions the list counts.
              role="none"
              data-index={virtualItem.index}
              className={cn(
                "left-0 z-10 w-full border-b bg-muted px-3 py-2 text-label text-muted-foreground",
                stuck ? cn("sticky", BELOW_HEADER) : "absolute top-0"
              )}
              style={stuck ? undefined : placed}
            >
              <h2>{dateHeading(item.date, today)}</h2>
            </li>
          );
        }
        return (
          <li
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            className="absolute left-0 top-0 w-full border-b last:border-b-0"
            style={placed}
          >
            {renderRow(item.row)}
          </li>
        );
      })}
    </ul>
  );
}
