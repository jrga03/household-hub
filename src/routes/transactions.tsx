import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { TransactionList } from "@/components/transactions/TransactionList";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);

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

      <PageShell variant="centered">
        <PageShell.Main className="space-y-4">
          {household && userId && <TransactionList actor={{ householdId: household.id, userId }} />}
        </PageShell.Main>
      </PageShell>
    </div>
  );
}
