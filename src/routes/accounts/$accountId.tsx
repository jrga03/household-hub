import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountBalance } from "@/components/AccountBalance";
import { TransactionList } from "@/components/TransactionList";
import { useAccountBalance } from "@/lib/supabaseQueries";
import { formatPHP } from "@/lib/currency";

export const Route = createFileRoute("/accounts/$accountId")({
  component: AccountDetailPage,
});

/**
 * AccountDetailPage Component
 *
 * Displays detailed information for a single account including:
 * - Account name and transaction count
 * - Large balance display with cleared/pending breakdown
 * - Initial balance and count statistics
 * - Filtered transaction list for this account
 *
 * Features:
 * - Back navigation to accounts list
 * - Real-time balance updates
 * - Transaction list filtered by account
 * - Loading and error states
 *
 * Route: /accounts/:accountId
 */
function AccountDetailPage() {
  const { accountId } = Route.useParams();
  const { data: balance, isLoading } = useAccountBalance(accountId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Account not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/accounts">
              <Button variant="ghost" size="sm" aria-label="Back to accounts">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">{balance.accountName}</h1>
              <p className="text-sm text-muted-foreground">
                {balance.transactionCount} transactions
              </p>
            </div>
          </div>

          {/* Balance Display */}
          <div className="bg-card rounded-lg border p-6">
            <AccountBalance
              currentBalance={balance.currentBalance}
              clearedBalance={balance.clearedBalance}
              pendingBalance={balance.pendingBalance}
              size="large"
              showSplit={true}
            />

            <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Initial Balance:</span>
                <span className="font-mono">{formatPHP(balance.initialBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cleared Transactions:</span>
                <span>{balance.clearedCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Pending Transactions:</span>
                <span>{balance.pendingCount}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Transactions */}
      <main className="container mx-auto px-4 py-8">
        <h2 className="text-lg font-semibold mb-4">Transactions</h2>
        <TransactionList
          filters={{ accountId }}
          onEdit={(_id) => {
            // TODO: Implement transaction editing (future chunk)
            // Will open TransactionFormDialog with editingId={_id}
          }}
        />
      </main>
    </div>
  );
}
