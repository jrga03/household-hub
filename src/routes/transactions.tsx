import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TransactionList } from "@/components/TransactionList";
import { TransactionFormDialog } from "@/components/TransactionFormDialog";
import { TransactionFilters as TransactionFiltersComponent } from "@/components/TransactionFilters";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useTransactions } from "@/lib/supabaseQueries";
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
  validateSearch: (search: Record<string, unknown>): TransactionFilters => ({
    dateFrom: (search.dateFrom as string) || undefined,
    dateTo: (search.dateTo as string) || undefined,
    accountId: (search.accountId as string) || undefined,
    categoryId: (search.categoryId as string) || undefined,
    status: search.status === "pending" || search.status === "cleared" ? search.status : null,
    type: search.type === "income" || search.type === "expense" ? search.type : null,
    search: (search.search as string) || undefined,
    // CRITICAL: Default to true (hide transfers) unless explicitly "false"
    excludeTransfers: search.excludeTransfers === "false" ? false : true,
  }),
});

function Transactions() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Debounce search term to avoid excessive queries
  // Other filters update immediately
  const debouncedFilters = {
    ...search,
    search: useDebounce(search.search, 300),
  };

  // Fetch transactions with debounced filters
  const { data: transactions } = useTransactions(debouncedFilters);

  const updateFilters = (newFilters: TransactionFilters) => {
    navigate({
      search: (prev) => ({ ...prev, ...newFilters }),
    });
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">Transactions</h1>
            <p className="text-sm text-muted-foreground">Track your income and expenses</p>
          </div>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Transaction
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Filters */}
        <TransactionFiltersComponent filters={search} onFiltersChange={updateFilters} />

        {/* Result Count */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {transactions?.length || 0} transaction{transactions?.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Transaction List */}
        <TransactionList filters={debouncedFilters} onEdit={handleEdit} />
      </main>

      {/* Form Dialog */}
      <TransactionFormDialog open={isFormOpen} onClose={handleClose} editingId={editingId} />
    </div>
  );
}
