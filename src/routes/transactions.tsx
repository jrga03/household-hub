import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
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
        {/* Aligned with the rail layout below, which drops its max width from 1100px. */}
        <div className="@container">
          <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-4 px-4 py-4 @[1100px]:max-w-none">
            <div>
              <h1 className="text-xl font-bold">Transactions</h1>
              <p className="text-sm text-muted-foreground">
                Everything recorded, newest first. Recorded offline, it syncs when you&apos;re back.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/import">Import statement</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* The list fills the main column and the detail pane beside it. */}
      <PageShell variant="rail">
        {household && userId && (
          <TransactionList
            actor={{ householdId: household.id, userId }}
            filter={filter}
            onFilterChange={setFilter}
          />
        )}
      </PageShell>
    </div>
  );
}
