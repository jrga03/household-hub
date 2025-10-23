import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen bg-background">
      <Header />

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
            <Link
              to="/accounts"
              className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
            >
              View Accounts →
            </Link>
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
