import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";
import { useAccounts } from "@/lib/supabaseQueries";
import { TransferForm } from "@/components/transfers/TransferForm";
import { TransferList } from "@/components/transfers/TransferList";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/transfers")({
  component: TransfersPage,
});

function TransfersPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  // Fetch accounts for the transfer form
  const { data: accounts, isLoading: accountsLoading, error } = useAccounts();

  // Hardcoded household ID for MVP (single household)
  const householdId = "00000000-0000-0000-0000-000000000001";

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" }).catch(console.error);
    }
  }, [user, navigate]);

  if (!user) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (accountsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
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

  // Transform accounts data to the format expected by TransferForm
  const accountOptions =
    accounts?.map((account) => ({
      id: account.id,
      name: account.name,
    })) || [];

  return (
    <div className="min-h-dvh bg-background">
      {/* Page Header */}
      <div className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold">Transfers</h1>
          <p className="text-sm text-muted-foreground">Move money between your accounts</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto max-w-2xl px-4 py-8 space-y-8">
        {/* Create Transfer Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Create Transfer</h2>
          {accountOptions.length < 2 ? (
            <div className="p-6 border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground text-center">
                You need at least 2 accounts to create a transfer.
              </p>
              <p className="text-sm text-muted-foreground text-center mt-2">
                Go to{" "}
                <Button
                  variant="link"
                  className="p-0 h-auto"
                  onClick={() => navigate({ to: "/accounts" })}
                >
                  Accounts
                </Button>{" "}
                to create more accounts.
              </p>
            </div>
          ) : (
            <TransferForm accounts={accountOptions} householdId={householdId} userId={user.id} />
          )}
        </div>

        {/* Recent Transfers Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Transfers</h2>
          <TransferList householdId={householdId} />
        </div>
      </div>
    </div>
  );
}
