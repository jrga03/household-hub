import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TransactionList } from "@/components/TransactionList";
import { TransactionFormDialog } from "@/components/TransactionFormDialog";
import { TransactionFiltersPanel } from "@/components/TransactionFilters";
import { useDebounce } from "@/hooks/useDebounce";
import { useTransactions } from "@/lib/supabaseQueries";
import { usePrefetchTransactionData } from "@/hooks/usePrefetchTransactionData";
import { useOpenTransactionFormShortcut } from "@/hooks/useKeyboardShortcuts";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSelectedItem } from "@/hooks/useSelectedItem";
import { PageShell } from "@/components/layout/PageShell";
import { TransactionDetailPane } from "@/components/transactions/TransactionDetailPane";
import { TransactionFilterSheet } from "@/components/transactions/TransactionFilterSheet";
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
  const { selectedId, select, clear } = useSelectedItem({ paramKey: "selected" });
  // Below the @[1500px] triple-column breakpoint, row clicks open the legacy
  // edit modal instead of selecting into the (hidden) detail pane.
  const isNarrow = useMediaQuery("(max-width: 1499px)");

  usePrefetchTransactionData();
  useOpenTransactionFormShortcut(() => setIsFormOpen(true));

  const debouncedFilters = {
    ...search,
    search: useDebounce(search.search, 300),
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
    navigate({ search: (prev) => ({ ...prev, ...newFilters }) });
  };

  const handleRowClick = (id: string) => {
    if (isNarrow) {
      setEditingId(id);
      setIsFormOpen(true);
    } else {
      select(id);
    }
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  return (
    <div className="bg-background">
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
            <div className="text-sm text-muted-foreground">
              {transactions?.length || 0} transaction{transactions?.length !== 1 ? "s" : ""}
            </div>
            <div className="@[1100px]:hidden">
              <TransactionFilterSheet filters={search} onFiltersChange={updateFilters} />
            </div>
          </div>
          <TransactionList filters={debouncedFilters} onEdit={handleRowClick} />
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
    </div>
  );
}
