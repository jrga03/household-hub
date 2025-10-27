import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { startOfMonth } from "date-fns";
import { MonthSelector } from "@/components/MonthSelector";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { useDashboardData } from "@/lib/supabaseQueries";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const { data, isLoading, error, refetch } = useDashboardData(selectedMonth);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12">
          <div className="text-center space-y-4 max-w-md mx-auto">
            <h2 className="text-xl font-semibold text-destructive">Failed to Load Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "An unexpected error occurred"}
            </p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Dashboard</h1>
              <p className="text-sm text-muted-foreground">Financial overview</p>
            </div>
            <MonthSelector selectedMonth={selectedMonth} onChange={setSelectedMonth} />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Summary Cards */}
        <SummaryCards summary={data.summary} />

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          <MonthlyChart data={data.monthlyTrend} />
          <CategoryChart data={data.categoryBreakdown} />
        </div>

        {/* Recent Transactions */}
        <RecentTransactions transactions={data.recentTransactions} />
      </main>
    </div>
  );
}
