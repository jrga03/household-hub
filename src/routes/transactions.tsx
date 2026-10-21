import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/app/Button";
import { HeaderActions, useHeaderSlot } from "@/components/layout/HeaderActions";
import { readOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { TransactionList } from "@/components/transactions/TransactionList";
import { useHousehold } from "@/hooks/useHousehold";
import { readTransactionFilter, type TransactionFilter } from "@/lib/transactions/filter";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/transactions")({
  staticData: { title: "Transactions" },
  validateSearch: (search: Record<string, unknown>) => ({
    ...readTransactionFilter(search),
    ...readOpenItem(search),
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  const filter = Route.useSearch({
    select: ({ open: _open, ...filter }): TransactionFilter => filter,
    structuralSharing: true,
  });
  const navigate = Route.useNavigate();
  // The open transaction stays open while the filters change.
  const setFilter = (next: TransactionFilter) =>
    void navigate({
      search: ({ open }) => (open === undefined ? next : { ...next, open }),
      replace: true,
    });
  const { mode } = useHeaderSlot();

  return (
    <>
      {/* Phones reach Import from the drawer, leaving the header to Select. */}
      {!mode && (
        <HeaderActions>
          <Button asChild variant="outline" size="sm" className="hidden medium:inline-flex">
            <Link to="/import">Import statement</Link>
          </Button>
        </HeaderActions>
      )}

      <PageShell variant="list-detail">
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
