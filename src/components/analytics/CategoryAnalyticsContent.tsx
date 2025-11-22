import { useState } from "react";
import { startOfMonth, subMonths } from "date-fns";
import { MonthSelector } from "@/components/MonthSelector";
import { CategoryTotalsGroup } from "@/components/CategoryTotalsGroup";
import { useCategoryTotalsComparison } from "@/lib/supabaseQueries";
import { formatPHP } from "@/lib/currency";

/**
 * Category Analytics Content Component
 * Displays monthly spending breakdown by category with month-over-month comparison.
 * Used within the Analytics tabs interface.
 */
export function CategoryAnalyticsContent() {
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const previousMonth = subMonths(selectedMonth, 1);

  const { current, previous, isLoading } = useCategoryTotalsComparison(
    selectedMonth,
    previousMonth
  );

  // Handle error states
  if (current.isError || previous.isError) {
    return (
      <div className="flex items-center justify-center min-h-96">
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
      <div className="flex items-center justify-center min-h-96">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Month Selector and Summary */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-lg font-semibold mb-1">Monthly Spending by Category</h2>
          <p className="text-sm text-muted-foreground">
            Compare spending across categories and track changes over time
          </p>
        </div>
        <MonthSelector selectedMonth={selectedMonth} onChange={setSelectedMonth} />
      </div>

      {/* Summary Card */}
      <div className="bg-card rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Total Spending</div>
            <div className="text-3xl font-bold font-mono">{formatPHP(totalSpending)}</div>
          </div>
          {previousTotalSpending > 0 && (
            <div className="text-right">
              <div className="text-sm text-muted-foreground mb-1">vs Last Month</div>
              <div
                className={`text-2xl font-semibold ${
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

      {/* Category Groups */}
      {!current.data || current.data.length === 0 ? (
        <div className="text-center py-12 rounded-lg border border-dashed">
          <p className="text-lg font-medium text-muted-foreground">
            No spending data for this month
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Transactions will appear here once you add them
          </p>
        </div>
      ) : (
        <div className="space-y-6">
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
    </div>
  );
}
