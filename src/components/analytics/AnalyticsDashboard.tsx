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

  // Convert categoryBreakdown data format for CategoryChart component.
  // categoryId is the REAL category id from processCategoryBreakdown, so
  // click-through lands on /transactions?categoryId=<real id> (review R18)
  const categoryTotalCents = data.categoryBreakdown.reduce((sum, cat) => sum + cat.valueCents, 0);
  const categoryChartData = data.categoryBreakdown.map((d, index) => ({
    categoryId: d.categoryId,
    categoryName: d.name,
    color: generateColor(index),
    amountCents: d.valueCents,
    percentOfTotal: categoryTotalCents > 0 ? (d.valueCents / categoryTotalCents) * 100 : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-income" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-income">{formatPHP(data.totalIncome)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-expense" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-expense">{formatPHP(data.totalExpenses)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Amount</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${netIncome >= 0 ? "text-income" : "text-expense"}`}
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

      {/* Charts Grid — MonthlyChart/CategoryChart/BudgetProgressChart render
          their own Cards; wrapping them again doubled borders and padding and
          squeezed the plots on phones (review R32). YearOverYearChart is the
          only chart without a self-wrapping Card, so it keeps the outer one. */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Spending Trend */}
        <MonthlyChart data={monthlyChartData} />

        {/* Category Breakdown (CategoryChart renders its own empty state) */}
        <CategoryChart data={categoryChartData} />

        {/* Year-over-Year */}
        <Card>
          <CardHeader>
            <CardTitle>Year-over-Year Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <YearOverYearChart data={data.yearOverYear} />
          </CardContent>
        </Card>

        {/* Budget Variance (BudgetProgressChart renders its own Cards) */}
        <BudgetProgressChart data={data.budgetVariance} />
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
