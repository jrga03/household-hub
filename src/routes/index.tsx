import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { startOfMonth } from "date-fns";
import { MonthSelector } from "@/components/MonthSelector";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { ChartCardSkeleton } from "@/components/dashboard/ChartCardSkeleton";
import { useDashboardData } from "@/lib/supabaseQueries";
import { PageShell } from "@/components/layout/PageShell";
import { Card } from "@/components/ui/card";
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

  // Header paints in every state (loading included) so month navigation and
  // the page identity never flash away behind a spinner (review R41)
  const header = (
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
  );

  if (isLoading) {
    return (
      <div className="bg-background">
        {header}
        <DashboardSkeleton />
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
      {header}

      <PageShell variant="rail">
        <PageShell.Main className="space-y-6">
          <SummaryCards summary={data.summary} />
          <Suspense fallback={<ChartCardSkeleton />}>
            <MonthlyChart data={data.monthlyTrend} />
          </Suspense>
          <RecentTransactions transactions={data.recentTransactions} />
        </PageShell.Main>
        <PageShell.RightAside>
          <Suspense fallback={<ChartCardSkeleton />}>
            <DashboardRail categoryBreakdown={data.categoryBreakdown} />
          </Suspense>
        </PageShell.RightAside>
      </PageShell>
    </div>
  );
}

/**
 * Layout-shaped dashboard loading state (review R41): mirrors the real
 * rail layout — summary cards grid, chart card, recent-transaction rows —
 * so content appears in place instead of jumping in after a spinner.
 */
function DashboardSkeleton() {
  return (
    <PageShell variant="rail">
      <PageShell.Main className="space-y-6">
        <span role="status" className="sr-only">
          Loading dashboard
        </span>

        {/* SummaryCards grid (same container-query breakpoints) */}
        <div className="@container">
          <div className="grid gap-4 grid-cols-1 @[480px]:grid-cols-2 @[900px]:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4 sm:p-6">
                <div className="flex items-start gap-2">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
                  <div className="min-w-0 space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-28" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* MonthlyChart card (structural, not a magic-height block) */}
        <ChartCardSkeleton />

        {/* RecentTransactions rows */}
        <Card className="p-6">
          <Skeleton className="mb-4 h-7 w-44" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </PageShell.Main>

      <PageShell.RightAside>
        {/* DashboardRail (category chart card) */}
        <ChartCardSkeleton />
      </PageShell.RightAside>
    </PageShell>
  );
}
