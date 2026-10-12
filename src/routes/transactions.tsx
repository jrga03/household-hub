import { createFileRoute } from "@tanstack/react-router";
import { TransactionList } from "@/components/transactions/TransactionList";
import { useHousehold } from "@/hooks/useHousehold";
import { readTransactionFilter, type TransactionFilter } from "@/lib/transactions/filter";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/transactions")({
  validateSearch: readTransactionFilter,
  component: TransactionsPage,
});

function TransactionsPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  const filter = Route.useSearch();
  const navigate = Route.useNavigate();
  const setFilter = (next: TransactionFilter) => void navigate({ search: next, replace: true });

  return (
    <div className="bg-background">
      <div className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            Everything recorded, newest first. Recorded offline, it syncs when you&apos;re back.
          </p>
        </div>
      </div>

      {household && userId && (
        <TransactionList
          actor={{ householdId: household.id, userId }}
          filter={filter}
          onFilterChange={setFilter}
        />
      )}
    </div>
  );
}
