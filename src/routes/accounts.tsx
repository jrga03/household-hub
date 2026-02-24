import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { useEffect, useState } from "react";
import { useAccounts, useAccountBalances } from "@/lib/supabaseQueries";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AccountFormDialog } from "@/components/AccountFormDialog";
import { AccountBalanceCard } from "@/components/AccountBalanceCard";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/accounts")({
  component: Accounts,
});

function Accounts() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: accounts, isLoading: accountsLoading, error } = useAccounts();
  const { data: balances, isLoading: balancesLoading } = useAccountBalances();

  const isLoading = accountsLoading || balancesLoading;

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" }).catch(console.error);
    }
  }, [user, navigate]);

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Loading accounts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-destructive">Failed to load accounts</p>
            <p className="text-sm text-muted-foreground mt-2">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button onClick={() => window.location.reload()} className="mt-4">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <Header />

      {/* Page Header */}
      <div className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">Accounts</h1>
            <p className="text-sm text-muted-foreground">Manage your financial accounts</p>
          </div>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        {!accounts || accounts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No accounts yet</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => {
              const balance = balances?.find((b) => b.accountId === account.id) || {
                currentBalance: account.initial_balance_cents || 0,
                clearedBalance: account.initial_balance_cents || 0,
                pendingBalance: 0,
              };

              return (
                <AccountBalanceCard
                  key={account.id}
                  account={{
                    id: account.id,
                    name: account.name,
                    type: account.type,
                    color: account.color ?? undefined,
                    icon: account.icon ?? undefined,
                  }}
                  balance={balance}
                />
              );
            })}
          </div>
        )}

        {/* Account Form Dialog */}
        <AccountFormDialog
          open={isFormOpen}
          onClose={() => {
            setIsFormOpen(false);
            setEditingId(null);
          }}
          editingId={editingId}
        />
      </main>
    </div>
  );
}
