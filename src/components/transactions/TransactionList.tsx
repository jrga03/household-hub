import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultRangeExtractor, useWindowVirtualizer, type Range } from "@tanstack/react-virtual";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/app/Button";
import { EmptyState } from "@/components/app/EmptyState";
import { Money } from "@/components/app/Money";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/app/Popover";
import { SectionHeader } from "@/components/app/SectionHeader";
import { ContextMode } from "@/components/layout/ContextMode";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { DetailPane, resolveOpenItem, useOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { BELOW_HEADER, useTwoPanes } from "@/components/layout/pane";
import { useAllAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { useTransactionListRows } from "@/hooks/useTransactions";
import type { Actor } from "@/lib/commands/accounts";
import { diffCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { dateHeading, groupByDate, type DateGroupItem } from "@/lib/transactions/date-groups";
import {
  filterTransactions,
  isCorrection,
  totalTransactions,
  UNASSIGNED_FILTER,
  type ListRow,
  type TransactionFilter,
} from "@/lib/transactions/filter";
import { CorrectionDetails } from "@/components/corrections/CorrectionDialog";
import { CORRECTION_LABEL } from "@/lib/corrections/events";
import { cn, countOf } from "@/lib/utils";
import { monthLabel, monthOfDate, monthRangeLabel } from "@/lib/utils/dates";
import { SelectionActions } from "./SelectionActions";
import { rowDisplay, totalKind, useRowNames, type RowDisplay } from "./rowDisplay";
import { TransactionDetail } from "./TransactionDetail";
import { TransactionItem } from "./TransactionItem";
import { TransactionFilters } from "./TransactionFilters";
import { TransactionTable } from "./TransactionTable";
import type { RevealedAction } from "./useRowGestures";

const ROW_HEIGHT_ESTIMATE = 61;
const HEADING_HEIGHT_ESTIMATE = 41;

/** "yyyy-MM" months holding transactions or transfers, newest first (the list is newest first). */
const monthsOf = (rows: ListRow[]) => [...new Set(rows.map((row) => monthOfDate(row.date)))];

/** Each date's income less its expenses; transfers and corrections count for neither. */
function netByDate(rows: ListRow[]): Map<string, Cents> {
  const byDate = new Map<string, ListRow[]>();
  for (const row of rows) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
  return new Map([...byDate].map(([date, dayRows]) => [date, totalTransactions(dayRows).netCents]));
}

interface TransactionListProps {
  actor: Actor;
  filter: TransactionFilter;
  onFilterChange: (filter: TransactionFilter) => void;
}

/**
 * Transactions, transfers and balance corrections, newest first, filtered.
 * A transfer is one row for both legs, signed when an account is filtered.
 * Beside a detail pane (a shell from 840) it is a table under a summary, with
 * the filter rail beside it while nothing is open; narrower, it is a list
 * under date headers with filter chips. A row opens in the `DetailPane`. A
 * long press or the header's Select starts selecting.
 */
export function TransactionList({ actor, filter, onFilterChange }: TransactionListProps) {
  const rows = useTransactionListRows();
  const accounts = useAllAccounts();
  const categories = useCategoryList();
  const names = useRowNames();
  const twoPanes = useTwoPanes();
  const { openId, open, close } = useOpenItem();
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [revealed, setRevealed] = useState<{ id: string; action: RevealedAction } | null>(null);
  // A new filter starts a new selection, so hidden rows don't come back selected.
  const [selectionFilter, setSelectionFilter] = useState(filter);
  if (selectionFilter !== filter) {
    setSelectionFilter(filter);
    setSelectedIds(new Set());
  }

  const shown = useMemo(() => (rows ? filterTransactions(rows, filter) : []), [rows, filter]);
  const items = useMemo(() => groupByDate(shown), [shown]);
  const dayNets = useMemo(() => netByDate(shown), [shown]);
  const selected = useMemo(
    () => shown.filter((row) => selectedIds.has(row.id)),
    [shown, selectedIds]
  );
  const months = useMemo(() => monthsOf(rows ?? []), [rows]);
  const openRow = resolveOpenItem(openId, rows && ((id) => rows.find((row) => row.id === id)));

  if (!rows) return null;

  const displayOf = (row: ListRow): RowDisplay => rowDisplay(row, names, filter.account);

  const detailPane = (
    <DetailPane
      title={!openRow ? "" : isCorrection(openRow) ? CORRECTION_LABEL : displayOf(openRow).label}
      item={openRow}
    >
      {(row) =>
        // Keyed, so local state follows the row picked.
        isCorrection(row) ? (
          <CorrectionDetails key={row.id} actor={actor} correction={row} onClose={close} />
        ) : (
          <TransactionDetail key={row.id} actor={actor} row={row} display={displayOf(row)} />
        )
      }
    </DetailPane>
  );

  if (rows.length === 0) {
    return (
      <>
        <PageShell.List>
          <EmptyState>
            No transactions yet. Add one with the Add transaction button or by pressing n.
          </EmptyState>
        </PageShell.List>
        {detailPane}
      </>
    );
  }

  const startSelecting = (firstId?: string) => {
    setSelecting(true);
    close();
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

  const filters = (layout: "chips" | "rail") => (
    <TransactionFilters
      filter={filter}
      onChange={onFilterChange}
      months={months}
      accounts={accounts?.list ?? []}
      categories={categories}
      layout={layout}
    />
  );
  const noMatch = <EmptyState>No transactions match these filters.</EmptyState>;
  // The rail gives way to the open item, so the table keeps its width.
  const railFolded = Boolean(openRow);

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

      <PageShell.List className="space-y-4">
        {twoPanes && !selecting ? (
          <div className="flex gap-6">
            {!railFolded && <div className="w-56 shrink-0">{filters("rail")}</div>}
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <Summary rows={shown} filter={filter} />
                {railFolded && <FiltersButton>{filters("rail")}</FiltersButton>}
              </div>
              {shown.length === 0 ? (
                noMatch
              ) : (
                <TransactionTable
                  actor={actor}
                  rows={shown.map((row) => ({ row, display: displayOf(row) }))}
                  openId={openId}
                  onOpen={open}
                />
              )}
            </div>
          </div>
        ) : (
          <>
            {filters("chips")}
            {shown.length === 0 ? (
              noMatch
            ) : (
              <VirtualTransactionRows
                items={items}
                dayNets={dayNets}
                renderRow={(row) => (
                  <TransactionItem
                    actor={actor}
                    row={row}
                    display={displayOf(row)}
                    open={row.id === openId}
                    selecting={selecting}
                    selected={selectedIds.has(row.id)}
                    revealed={revealed?.id === row.id ? revealed.action : null}
                    onRevealChange={(action) => revealRow(row.id, action)}
                    onTap={() => (selecting ? toggleSelected(row.id) : open(row.id))}
                    onLongPress={() =>
                      selecting ? toggleSelected(row.id) : startSelecting(row.id)
                    }
                  />
                )}
              />
            )}
          </>
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
              accountsById={accounts?.byId ?? new Map()}
              categories={categories}
              onDone={stopSelecting}
            />
          </ContextMode>
        )}
      </PageShell.List>

      {detailPane}
    </>
  );
}

function periodLabel({ month, from, to }: TransactionFilter): string {
  if (month) return monthLabel(month);
  return from && to ? monthRangeLabel(from, to) : "All months";
}

/**
 * "October 2026 · 28 transactions · In +₱… · Out −₱…" over the table. With one
 * category and no type, also "Spent ₱…": its expenses less its income.
 */
function Summary({ rows, filter }: { rows: ListRow[]; filter: TransactionFilter }) {
  const { incomeCents, expenseCents } = totalTransactions(rows);
  const showsSpent =
    filter.category !== undefined && filter.category !== UNASSIGNED_FILTER && !filter.type;
  const spentCents = diffCents(expenseCents, incomeCents);
  return (
    <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 text-body text-muted-foreground">
      <span className="font-medium text-foreground">{periodLabel(filter)}</span>
      <span>{countOf(rows.length, "transaction", "transactions")}</span>
      <span>
        In <Money {...totalKind("in", incomeCents)} cents={incomeCents} />
      </span>
      <span>
        Out{" "}
        <Money
          {...totalKind("out", expenseCents)}
          cents={expenseCents}
          className="text-foreground"
        />
      </span>
      {showsSpent && (
        <span>
          Spent <Money kind="balance" cents={spentCents} className="text-foreground" />
        </span>
      )}
    </p>
  );
}

/** The folded filter rail: the same filters in a popover. */
function FiltersButton({ children }: { children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto">
          <SlidersHorizontal aria-hidden="true" />
          Filters
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        {children}
      </PopoverContent>
    </Popover>
  );
}

interface VirtualTransactionRowsProps {
  items: DateGroupItem<ListRow>[];
  dayNets: Map<string, Cents>;
  renderRow: (row: ListRow) => ReactNode;
}

/**
 * Renders only the items near the viewport; the page itself scrolls. The
 * heading of the date in view sticks under the shell header.
 */
function VirtualTransactionRows({ items, dayNets, renderRow }: VirtualTransactionRowsProps) {
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
      // The rows fill the height; the borders sit outside it. Rows run edge to edge on a phone.
      className="relative -mx-4 box-content border-y"
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
                "left-0 z-10 w-full border-b bg-background",
                stuck ? cn("sticky", BELOW_HEADER) : "absolute top-0"
              )}
              style={stuck ? undefined : placed}
            >
              <SectionHeader
                title={dateHeading(item.date, today)}
                action={<Money kind="net" cents={dayNets.get(item.date) ?? ZERO_CENTS} />}
                className="px-4 pb-1 pt-3"
              />
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
