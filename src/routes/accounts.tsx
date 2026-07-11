import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounts, useAccountBalances } from "@/lib/supabaseQueries";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AccountFormDialog } from "@/components/AccountFormDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/layout/PageShell";
import { useSelectedItem } from "@/hooks/useSelectedItem";
import { useContainerNarrow } from "@/hooks/useContainerWidth";
import { AccountListItem } from "@/components/accounts/AccountListItem";
import { AccountDetailPane } from "@/components/accounts/AccountDetailPane";
import { AccountBalanceCard } from "@/components/AccountBalanceCard";

export const Route = createFileRoute("/accounts")({
  component: Accounts,
  validateSearch: (search: Record<string, unknown>) => ({
    selected: typeof search.selected === "string" ? search.selected : undefined,
  }),
});

function Accounts() {
  // Authentication is guaranteed by the root route's beforeLoad guard
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: accounts, isLoading: accountsLoading, error } = useAccounts();
  const { data: balances, isLoading: balancesLoading } = useAccountBalances();

  const { selectedId, select } = useSelectedItem({ paramKey: "selected" });
  // Below the @[1100px] split breakpoint the right pane is hidden, so clicking
  // an account opens the modal instead. Measured on the page region (not the
  // viewport) to match PageShell's @container pane toggle (review UI-05).
  const [regionRef, isNarrow] = useContainerNarrow(1100);

  const isLoading = accountsLoading || balancesLoading;

  // Header paints in every state; the loading body is shaped like the real
  // account list rows so nothing jumps when data lands (review R41)
  const header = (
    <div className="border-b">
      <div className="container mx-auto max-w-7xl flex items-center justify-between px-4 py-4">
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
  );

  if (isLoading) {
    return (
      <div className="bg-background">
        {header}
        <PageShell variant="split">
          <PageShell.Main>
            <span role="status" className="sr-only">
              Loading accounts
            </span>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-full rounded-lg border px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </PageShell.Main>
          <PageShell.RightAside className="hidden @[1100px]:block">
            <div className="rounded-lg border bg-card p-6">
              <Skeleton className="mb-4 h-6 w-40" />
              <Skeleton className="h-40 w-full" />
            </div>
          </PageShell.RightAside>
        </PageShell>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-background">
        <div className="container mx-auto max-w-7xl px-4 py-8">
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

  const handleAccountClick = (id: string) => {
    if (isNarrow) {
      setEditingId(id);
      setIsFormOpen(true);
    } else {
      select(id);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  return (
    <div ref={regionRef} className="bg-background">
      {/* Page Header */}
      {header}

      <PageShell variant="split">
        <PageShell.Main>
          {!accounts || accounts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No accounts yet</p>
              <Button onClick={() => setIsFormOpen(true)} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Add your first account
              </Button>
            </div>
          ) : isNarrow ? (
            <div className="grid gap-3">
              {accounts.map((account) => {
                const bal = balances?.find((b) => b.accountId === account.id);
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
                    balance={{
                      currentBalance: bal?.currentBalance ?? account.initial_balance_cents ?? 0,
                      clearedBalance: bal?.clearedBalance ?? account.initial_balance_cents ?? 0,
                      pendingBalance: bal?.pendingBalance ?? 0,
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => {
                const bal = balances?.find((b) => b.accountId === account.id);
                return (
                  <AccountListItem
                    key={account.id}
                    name={account.name}
                    type={account.type}
                    balanceCents={bal?.currentBalance ?? account.initial_balance_cents ?? 0}
                    selected={selectedId === account.id}
                    onSelect={() => handleAccountClick(account.id)}
                  />
                );
              })}
            </div>
          )}
        </PageShell.Main>
        <PageShell.RightAside className="hidden @[1100px]:block">
          <AccountDetailPane
            accountId={selectedId}
            accounts={accounts?.map((a) => ({ id: a.id, name: a.name, type: a.type })) ?? []}
            balances={balances ?? []}
            onAddAccount={() => setIsFormOpen(true)}
          />
        </PageShell.RightAside>
      </PageShell>

      <AccountFormDialog open={isFormOpen} onClose={handleCloseForm} editingId={editingId} />
    </div>
  );
}
