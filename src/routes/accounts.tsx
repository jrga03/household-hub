import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { useEffect, useState } from "react";
import { useAccounts, useArchiveAccount } from "@/lib/supabaseQueries";
import { formatPHP } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Archive } from "lucide-react";
import { AccountFormDialog } from "@/components/AccountFormDialog";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/accounts")({
  component: Accounts,
});

function Accounts() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: accounts, isLoading, error } = useAccounts();
  const archiveAccount = useArchiveAccount();

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" }).catch(console.error);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Loading accounts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
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
    <div className="min-h-screen bg-background">
      <Header />

      {/* Page Header */}
      <div className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Accounts</h1>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        {accounts && accounts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No accounts yet. Create your first account!</p>
            <Button onClick={() => setIsFormOpen(true)} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create Account
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts?.map((account) => (
              <div
                key={account.id}
                className="rounded-lg border-l-4 border p-6"
                style={{
                  borderLeftColor: account.color ?? "#3B82F6",
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{account.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">
                      {account.type.replace("_", " ")} •{" "}
                      {account.visibility === "household" ? "Household" : "Personal"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(account.id);
                        setIsFormOpen(true);
                      }}
                      aria-label={`Edit ${account.name}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Archive "${account.name}"?`)) {
                          archiveAccount.mutate(account.id);
                        }
                      }}
                      aria-label={`Archive ${account.name}`}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold">
                    {formatPHP(account.initial_balance_cents ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Initial Balance</p>
                </div>
              </div>
            ))}
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
