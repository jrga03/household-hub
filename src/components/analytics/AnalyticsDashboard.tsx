import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAnalytics } from "@/hooks/useAnalytics";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { BudgetProgressChart } from "@/components/charts/BudgetProgressChart";
import { YearOverYearChart } from "@/components/charts/YearOverYearChart";
import { InsightsSection } from "./InsightsSection";
import { FilterPanel } from "./FilterPanel";
import { formatPHP } from "@/lib/currency";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

export function AnalyticsDashboard() {
  // Fetch real accounts from Supabase
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch real categories from Supabase
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .is("parent_id", null) // Only top-level categories for filter
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const [filters, setFilters] = useState({
    startDate: startOfMonth(subMonths(new Date(), 5)),
    endDate: endOfMonth(new Date()),
    accountId: undefined as string | undefined,
    categoryId: undefined as string | undefined,
    type: undefined as "income" | "expense" | undefined,
  });

  const { data, isLoading, error } = useAnalytics(filters.startDate, filters.endDate, {
    accountId: filters.accountId,
    categoryId: filters.categoryId,
    type: filters.type,
  });

  if (isLoading || accountsLoading || categoriesLoading) {
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
      {/* Filters */}
      <FilterPanel
        onFilterChange={(newFilters) => setFilters({ ...filters, ...newFilters })}
        accounts={accounts}
        categories={categories}
      />

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
