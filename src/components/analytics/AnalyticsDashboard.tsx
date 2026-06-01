import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnalytics } from "@/hooks/useAnalytics";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { BudgetProgressChart } from "@/components/charts/BudgetProgressChart";
import { YearOverYearChart } from "@/components/charts/YearOverYearChart";
import { InsightsSection } from "./InsightsSection";
import { formatPHP } from "@/lib/currency";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

export interface AnalyticsFilters {
  startDate: Date;
  endDate: Date;
  accountId?: string;
  categoryId?: string;
  type?: "income" | "expense";
}

interface AnalyticsDashboardProps {
  filters: AnalyticsFilters;
}

export function AnalyticsDashboard({ filters }: AnalyticsDashboardProps) {
  const { data, isLoading, error } = useAnalytics(filters.startDate, filters.endDate, {
    accountId: filters.accountId,
    categoryId: filters.categoryId,
    type: filters.type,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-red-600">Error loading analytics: {error.message}</div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const netIncome = data.totalIncome - data.totalExpenses;

  // Convert monthlyTrend data format for MonthlyChart component
  const monthlyChartData = data.monthlyTrend.map((d) => ({
    month: d.month,
    incomeCents: d.income,
    expenseCents: d.expenses,
  }));

  // Convert categoryBreakdown data format for CategoryChart component
  const categoryChartData = data.categoryBreakdown.map((d, index) => ({
    categoryId: `category-${index}`,
    categoryName: d.name,
    color: generateColor(index),
    amountCents: d.value * 100, // Convert back to cents
    percentOfTotal:
      (d.value / data.categoryBreakdown.reduce((sum, cat) => sum + cat.value, 0)) * 100,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatPHP(data.totalIncome)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatPHP(data.totalExpenses)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Amount</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${netIncome >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {formatPHP(Math.abs(netIncome))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {netIncome >= 0 ? "Surplus" : "Deficit"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      <InsightsSection insights={data.insights} />

      {/* Charts Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Spending Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Spending Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyChart data={monthlyChartData} />
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryChartData.length > 0 ? (
              <CategoryChart data={categoryChartData} />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No category data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Year-over-Year */}
        <Card>
          <CardHeader>
            <CardTitle>Year-over-Year Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <YearOverYearChart data={data.yearOverYear} />
          </CardContent>
        </Card>

        {/* Budget Variance */}
        <Card>
          <CardHeader>
            <CardTitle>Budget Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <BudgetProgressChart data={data.budgetVariance} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Helper function to generate colors for pie chart
function generateColor(index: number): string {
  const colors = [
    "#ef4444",
    "#f59e0b",
    "#10b981",
    "#3b82f6",
    "#6366f1",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#84cc16",
  ];
  return colors[index % colors.length];
}
