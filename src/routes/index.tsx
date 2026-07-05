import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { startOfMonth } from "date-fns";
import { MonthSelector } from "@/components/MonthSelector";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { useDashboardData } from "@/lib/supabaseQueries";
import { PageShell } from "@/components/layout/PageShell";
import { Skeleton } from "@/components/ui/skeleton";

// Charts pull in recharts (~190KB gz). Lazy-load them so the dashboard's
// first paint (cards + list) doesn't wait on chart vendor code (review UI-03)
const MonthlyChart = lazy(() =>
  import("@/components/dashboard/MonthlyChart").then((m) => ({ default: m.MonthlyChart }))
);
const DashboardRail = lazy(() =>
  import("@/components/dashboard/DashboardRail").then((m) => ({ default: m.DashboardRail }))
);

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const { data, isLoading, error, refetch } = useDashboardData(selectedMonth);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-background">
        <div className="container mx-auto max-w-7xl px-4 py-12">
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
    <div className="bg-background">
      {/* Month Selector Bar */}
      <div className="border-b bg-background">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold">Dashboard</h1>
              <p className="text-sm text-muted-foreground">Financial overview</p>
            </div>
            <MonthSelector selectedMonth={selectedMonth} onChange={setSelectedMonth} />
          </div>
        </div>
      </div>

      <PageShell variant="rail">
        <PageShell.Main className="space-y-6">
          <SummaryCards summary={data.summary} />
          <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
            <MonthlyChart data={data.monthlyTrend} />
          </Suspense>
          <RecentTransactions transactions={data.recentTransactions} />
        </PageShell.Main>
        <PageShell.RightAside>
          <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
            <DashboardRail categoryBreakdown={data.categoryBreakdown} />
          </Suspense>
        </PageShell.RightAside>
      </PageShell>
    </div>
  );
}
