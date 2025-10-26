import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { startOfMonth, subMonths } from "date-fns";
import { MonthSelector } from "@/components/MonthSelector";
import { CategoryTotalsGroup } from "@/components/CategoryTotalsGroup";
import { useCategoryTotalsComparison } from "@/lib/supabaseQueries";
import { formatPHP } from "@/lib/currency";

export const Route = createFileRoute("/analytics/categories")({
  component: CategoryAnalyticsPage,
});

function CategoryAnalyticsPage() {
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const previousMonth = subMonths(selectedMonth, 1);

  const { current, previous, isLoading } = useCategoryTotalsComparison(
    selectedMonth,
    previousMonth
  );

  // Handle error states
  if (current.isError || previous.isError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg font-medium text-destructive">Failed to load category data</p>
          <p className="text-sm text-muted-foreground mt-2">
            {current.error?.message || previous.error?.message}
          </p>
        </div>
      </div>
    );
  }

  // Calculate total spending for the month
  const totalSpending = current.data?.reduce((sum, group) => sum + group.totalExpenseCents, 0) || 0;

  const previousTotalSpending =
    previous.data?.reduce((sum, group) => sum + group.totalExpenseCents, 0) || 0;

  const spendingChange =
    previousTotalSpending > 0
      ? ((totalSpending - previousTotalSpending) / previousTotalSpending) * 100
      : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold">Category Analytics</h1>
              <p className="text-sm text-muted-foreground">Monthly spending by category</p>
            </div>
            <MonthSelector selectedMonth={selectedMonth} onChange={setSelectedMonth} />
          </div>

          {/* Summary Card */}
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Total Spending</div>
                <div className="text-2xl font-bold font-mono">{formatPHP(totalSpending)}</div>
              </div>
              {previousTotalSpending > 0 && (
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">vs Last Month</div>
                  <div
                    className={`text-lg font-semibold ${
                      spendingChange > 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {spendingChange > 0 ? "+" : ""}
                    {spendingChange.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Category Groups */}
      <main className="container mx-auto px-4 py-8">
        {!current.data || current.data.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg font-medium text-muted-foreground">
              No spending data for this month
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Transactions will appear here once you add them
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {current.data.map((group) => {
              const previousGroup = previous.data?.find((g) => g.parentId === group.parentId);

              return (
                <CategoryTotalsGroup
                  key={group.parentId || "uncategorized"}
                  group={group}
                  previousMonthData={previousGroup}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
