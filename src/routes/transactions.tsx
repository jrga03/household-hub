import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { PageShell } from "@/components/layout/PageShell";
import { TransactionList } from "@/components/transactions/TransactionList";
import { useHousehold } from "@/hooks/useHousehold";
import { readTransactionFilter, type TransactionFilter } from "@/lib/transactions/filter";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/transactions")({
  staticData: { title: "Transactions" },
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
    <>
      <HeaderActions>
        <Button asChild variant="outline" size="sm">
          <Link to="/import">Import statement</Link>
        </Button>
      </HeaderActions>

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
    </>
  );
}
