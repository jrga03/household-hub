import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TransactionList } from "@/components/TransactionList";
import { TransactionFormDialog } from "@/components/TransactionFormDialog";
import { TransactionFiltersPanel } from "@/components/TransactionFilters";
import { useDebounce } from "@/hooks/useDebounce";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTransactions,
  useToggleTransactionStatus,
  useDeleteTransaction,
} from "@/lib/supabaseQueries";
import { confirmAndDeleteTransaction } from "@/lib/delete-transaction";
import { usePrefetchTransactionData } from "@/hooks/usePrefetchTransactionData";
import { useContainerNarrow } from "@/hooks/useContainerWidth";
import { useSelectedItem } from "@/hooks/useSelectedItem";
import { PageShell } from "@/components/layout/PageShell";
import { TransactionDetailPane } from "@/components/transactions/TransactionDetailPane";
import { TransactionDetailSheet } from "@/components/transactions/TransactionDetailSheet";
import { TransactionFilterSheet } from "@/components/transactions/TransactionFilterSheet";
import { formatPHP } from "@/lib/currency";
import type { TransactionFilters } from "@/types/transactions";

/**
 * Route configuration with URL search param validation
 *
 * This ensures type safety and proper coercion of URL params:
 * - Strings → proper types (booleans, nulls)
 * - Default values (excludeTransfers: true)
 * - Makes filters bookmarkable and shareable
 */
export const Route = createFileRoute("/transactions")({
  component: Transactions,
  validateSearch: (
    search: Record<string, unknown>
  ): TransactionFilters & { selected?: string } => ({
    dateFrom: (search.dateFrom as string) || undefined,
    dateTo: (search.dateTo as string) || undefined,
    accountId: (search.accountId as string) || undefined,
    categoryId: (search.categoryId as string) || undefined,
    status: search.status === "pending" || search.status === "cleared" ? search.status : null,
    type: search.type === "income" || search.type === "expense" ? search.type : null,
    search: (search.search as string) || undefined,
    // CRITICAL: Default to true (hide transfers) unless explicitly "false"
    excludeTransfers: search.excludeTransfers === "false" ? false : true,
    amountMin: search.amountMin ? Number(search.amountMin) : undefined,
    amountMax: search.amountMax ? Number(search.amountMax) : undefined,
    selected: typeof search.selected === "string" ? search.selected : undefined,
  }),
});

function Transactions() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Controlled so the Sheet wrapper's back-gesture handling can close it (R37)
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  // Row tapped on a narrow layout: inspected read-only in a bottom sheet
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const { selectedId, select, clear } = useSelectedItem({ paramKey: "selected" });
  // Detail-sheet actions reuse the same mutation paths as the table's per-row
  // buttons (review R38: card mode has no row-level Delete/status controls)
  const toggleStatus = useToggleTransactionStatus();
  const deleteTransaction = useDeleteTransaction();
  const queryClient = useQueryClient();
  // Below the @[1500px] triple-column breakpoint the detail pane is hidden, so
  // row clicks open the edit modal instead. Measured on the page region (not
  // the viewport) so it agrees with PageShell's @container pane toggle even
  // when the sidebar is expanded (review UI-05).
  const [regionRef, isNarrow] = useContainerNarrow(1500);

  usePrefetchTransactionData();

  // `selected` is UI state (which row's detail pane is open), not a filter.
  // Keeping it out of the query input means clicking a row no longer changes
  // the ["transactions", filters] key and refetches the whole list (DATA-06).
  const { selected: _selected, ...filters } = search;
  const debouncedFilters = {
    ...filters,
    search: useDebounce(filters.search, 300),
  };

  const { data: transactions } = useTransactions(debouncedFilters);

  const filterSummary = {
    count: transactions?.length ?? 0,
    totalIn:
      transactions?.filter((t) => t.type === "income").reduce((s, t) => s + t.amount_cents, 0) ?? 0,
    totalOut:
      transactions?.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount_cents, 0) ??
      0,
  };

  const updateFilters = (newFilters: TransactionFilters) => {
    // replace: true so per-keystroke filter updates (e.g. typing in search)
    // don't create a history entry each — back-gesture would otherwise replay
    // every intermediate filter state (review R12).
    navigate({ search: (prev) => ({ ...prev, ...newFilters }), replace: true });
  };

  const handleRowClick = (id: string) => {
    if (isNarrow) {
      // No detail pane below @[1500px]: open a read-only bottom sheet with an
      // explicit Edit button instead of jumping straight into the edit form
      // (review R14/R38). Keyed off the container, not the viewport, so it
      // agrees with PageShell's pane visibility (UI-05).
      setInspectingId(id);
    } else {
      select(id);
    }
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  return (
    <div ref={regionRef} className="bg-background">
      {/* Page Header Bar */}
      <div className="border-b bg-background">
        <div className="container mx-auto max-w-7xl flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">Transactions</h1>
            <p className="text-sm text-muted-foreground">Track your income and expenses</p>
          </div>
          <Button onClick={() => setIsFormOpen(true)} className="hidden md:flex">
            <Plus className="mr-2 h-4 w-4" />
            Add Transaction
          </Button>
        </div>
      </div>

      {/*
        Triple variant lays out [main | detail | filters] at @[1500px], and
        [main | filters] at @[1100px] (detail hidden). PageShell slot names are
        positional fiction here: `LeftAside` = middle (detail), `RightAside` =
        right (filters). See PageShell JSDoc.
      */}
      <PageShell variant="triple">
        <PageShell.Main className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              <span>
                {transactions?.length || 0} transaction{transactions?.length !== 1 ? "s" : ""}
              </span>
              {/* Filtered In/Out totals are otherwise only visible in the
                  @[1500px] detail pane's filter summary; surface them inline
                  below that breakpoint (review R38) */}
              <span className="@[1500px]:hidden font-mono tabular-nums text-green-600 dark:text-green-400">
                In {formatPHP(filterSummary.totalIn)}
              </span>
              <span className="@[1500px]:hidden font-mono tabular-nums text-red-600 dark:text-red-400">
                Out {formatPHP(filterSummary.totalOut)}
              </span>
            </div>
            <div className="@[1100px]:hidden">
              <TransactionFilterSheet
                filters={search}
                onFiltersChange={updateFilters}
                open={isFilterSheetOpen}
                onOpenChange={setIsFilterSheetOpen}
              />
            </div>
          </div>
          <TransactionList
            filters={debouncedFilters}
            onEdit={handleRowClick}
            // The pencil is an explicit edit intent: skip the read-only sheet
            // that narrow-layout row taps open and go straight to the form
            onRequestEdit={(id) => {
              setEditingId(id);
              setIsFormOpen(true);
            }}
          />
        </PageShell.Main>

        <PageShell.LeftAside className="hidden @[1500px]:block">
          <TransactionDetailPane
            transactionId={selectedId}
            filterSummary={filterSummary}
            onEdit={(id) => {
              setEditingId(id);
              setIsFormOpen(true);
            }}
            onClear={clear}
          />
        </PageShell.LeftAside>

        <PageShell.RightAside className="hidden @[1100px]:block">
          <div className="rounded-lg border bg-card p-4">
            <TransactionFiltersPanel filters={search} onFiltersChange={updateFilters} />
          </div>
        </PageShell.RightAside>
      </PageShell>

      <TransactionFormDialog open={isFormOpen} onClose={handleClose} editingId={editingId} />

      <TransactionDetailSheet
        transactionId={inspectingId}
        onClose={() => setInspectingId(null)}
        onEdit={(id) => {
          setInspectingId(null);
          setEditingId(id);
          setIsFormOpen(true);
        }}
        onDelete={(id) => {
          const transaction = transactions?.find((t) => t.id === id);
          void confirmAndDeleteTransaction({
            id,
            description: transaction?.description ?? "",
            isTransferLeg: !!transaction?.transfer_group_id,
            deleteTransaction: deleteTransaction.mutateAsync,
            queryClient,
          }).then((deleted) => {
            if (deleted) setInspectingId(null);
          });
        }}
        onToggleStatus={(id) => {
          toggleStatus.mutate(id, {
            onSuccess: () => {
              // The toggle hook invalidates the list query; the open sheet
              // reads ["transaction", id], so refresh that too — the sheet
              // stays open and the button label flips to the new status
              void queryClient.invalidateQueries({ queryKey: ["transaction", id] });
            },
          });
        }}
      />
    </div>
  );
}
