/**
 * Category Insights Dashboard Component
 *
 * Comprehensive dashboard for category-based financial insights.
 * Combines multiple visualizations:
 * - Category breakdown pie chart
 * - Spending trends over time
 * - Budget progress cards
 * - Top categories ranking
 * - Month-over-month comparisons
 *
 * @example
 * <CategoryInsightsDashboard
 *   month="2024-01"
 *   onCategoryClick={(categoryId) => filterTransactions(categoryId)}
 * />
 */

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryBreakdownChart, SpendingTrendsChart } from "@/components/charts";
import { BudgetProgressCard } from "@/components/BudgetProgressCard";
import { TrendingUp, TrendingDown, Award } from "lucide-react";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface CategorySpending {
  id: string;
  name: string;
  color?: string;
  currentMonth: number; // cents
  previousMonth: number; // cents
  budgetAmount?: number; // cents
}

interface CategoryInsightsDashboardProps {
  categories: CategorySpending[];
  monthlyTrends?: Array<{
    month: string;
    [category: string]: string | number;
  }>;
  currentMonth?: string; // "January 2024"
  onCategoryClick?: (categoryId: string) => void;
}

export function CategoryInsightsDashboard({
  categories,
  monthlyTrends = [],
  currentMonth = "This Month",
  onCategoryClick,
}: CategoryInsightsDashboardProps) {
  // Calculate total spending
  const totalSpending = useMemo(
    () => categories.reduce((sum, cat) => sum + cat.currentMonth, 0),
    [categories]
  );

  // Sort categories by current spending
  const rankedCategories = useMemo(
    () => [...categories].sort((a, b) => b.currentMonth - a.currentMonth),
    [categories]
  );

  // Top 5 categories
  const topCategories = rankedCategories.slice(0, 5);

  // Categories with budgets
  const budgetCategories = categories.filter((cat) => cat.budgetAmount);

  // Prepare pie chart data
  const pieChartData = categories
    .filter((cat) => cat.currentMonth > 0)
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      value: cat.currentMonth,
      color: cat.color,
    }));

  // Calculate month-over-month change
  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return { percentage: 0, direction: "stable" as const };
    const change = ((current - previous) / previous) * 100;
    return {
      percentage: Math.abs(change),
      direction:
        change > 5 ? ("up" as const) : change < -5 ? ("down" as const) : ("stable" as const),
    };
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Spending</CardDescription>
            <CardTitle className="text-2xl font-mono">{formatPHP(totalSpending)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{currentMonth}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Categories</CardDescription>
            <CardTitle className="text-2xl">
              {categories.filter((c) => c.currentMonth > 0).length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{categories.length} total categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Budget Tracking</CardDescription>
            <CardTitle className="text-2xl">{budgetCategories.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Categories with budgets</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="breakdown" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
        </TabsList>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Spending Distribution</CardTitle>
                <CardDescription>Category breakdown for {currentMonth}</CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryBreakdownChart
                  data={pieChartData}
                  onCategoryClick={onCategoryClick}
                  height={350}
                />
              </CardContent>
            </Card>

            {/* Top Categories Ranking */}
            <Card>
              <CardHeader>
                <CardTitle>Top Categories</CardTitle>
                <CardDescription>Highest spending this month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topCategories.map((category, index) => {
                    const percentage = (category.currentMonth / totalSpending) * 100;
                    const change = calculateChange(category.currentMonth, category.previousMonth);

                    return (
                      <div key={category.id} className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-semibold">
                          {index === 0 && <Award className="h-4 w-4 text-yellow-600" />}
                          {index !== 0 && index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{category.name}</p>
                            {change.direction !== "stable" && (
                              <div
                                className={cn(
                                  "flex items-center gap-1 text-xs",
                                  change.direction === "up" ? "text-red-600" : "text-green-600"
                                )}
                              >
                                {change.direction === "up" ? (
                                  <TrendingUp className="h-3 w-3" />
                                ) : (
                                  <TrendingDown className="h-3 w-3" />
                                )}
                                <span>{change.percentage.toFixed(0)}%</span>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {percentage.toFixed(1)}% of total
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold">
                            {formatPHP(category.currentMonth)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Spending Trends</CardTitle>
              <CardDescription>Category spending over the last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <SpendingTrendsChart
                data={monthlyTrends}
                categories={categories.map((c) => c.name)}
                categoryColors={Object.fromEntries(
                  categories.map((c) => [c.name, c.color || "#3b82f6"])
                )}
                onBarClick={(_month, category) => {
                  const cat = categories.find((c) => c.name === category);
                  if (cat && onCategoryClick) onCategoryClick(cat.id);
                }}
                height={400}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Budgets Tab */}
        <TabsContent value="budgets" className="space-y-4">
          {budgetCategories.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {budgetCategories.map((category) => (
                <BudgetProgressCard
                  key={category.id}
                  categoryId={category.id}
                  categoryName={category.name}
                  categoryColor={category.color}
                  budgetAmount={category.budgetAmount || 0}
                  actualAmount={category.currentMonth}
                  period={currentMonth}
                  onViewTransactions={
                    onCategoryClick ? (catId) => onCategoryClick(catId!) : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center p-12">
                <div className="text-center">
                  <p className="text-lg font-medium text-muted-foreground">No budgets set</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Set budgets for categories to track your spending goals
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
