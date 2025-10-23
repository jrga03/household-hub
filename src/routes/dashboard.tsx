import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Household Hub</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <button
              onClick={signOut}
              className="rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="mt-2 text-muted-foreground">
          Welcome to your financial dashboard. Features coming soon!
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-6">
            <h3 className="font-semibold">Accounts</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage your bank accounts and balances
            </p>
            <p className="mt-4 text-2xl font-bold text-muted-foreground">Coming in Chunk 005</p>
          </div>

          <div className="rounded-lg border p-6">
            <h3 className="font-semibold">Transactions</h3>
            <p className="mt-2 text-sm text-muted-foreground">Track income and expenses</p>
            <p className="mt-4 text-2xl font-bold text-muted-foreground">Coming in Chunk 007</p>
          </div>

          <div className="rounded-lg border p-6">
            <h3 className="font-semibold">Budgets</h3>
            <p className="mt-2 text-sm text-muted-foreground">Set spending targets by category</p>
            <p className="mt-4 text-2xl font-bold text-muted-foreground">Coming in Chunk 009</p>
          </div>
        </div>
      </main>
    </div>
  );
}
