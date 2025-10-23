# Instructions: Analytics Dashboard

Follow these steps in order. Estimated time: 1.5 hours.

**Prerequisites Check**: Before starting, verify chunk 013 is complete and Recharts is installed.

---

## Step 1: Verify Dependencies (2 min)

**IMPORTANT**: Recharts and date-fns were already installed in chunk 013. Verify they exist:

```bash
# Check dependencies installed
grep -q "recharts" package.json && echo "✅ Recharts installed" || npm install recharts
grep -q "date-fns" package.json && echo "✅ date-fns installed" || npm install date-fns

# Verify chunk 013 basic dashboard exists
test -f src/components/dashboard/MonthlyChart.tsx && echo "✅ Chunk 013 complete" || echo "⚠️ Complete chunk 013 first"
```

**If any missing**, install them:

```bash
npm install recharts date-fns
```

---

## Step 2: Create Enhanced Analytics Hook (30 min)

Create `src/hooks/useAnalytics.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { startOfMonth, endOfMonth, subYears, format, differenceInDays } from "date-fns";

// Types for analytics data
interface Transaction {
  id: string;
  date: string;
  type: "income" | "expense";
  amount_cents: number;
  category_id: string;
  account_id: string;
  description: string;
  categories?: { name: string };
}

interface MonthlyTrendData {
  month: string;
  income: number; // in cents
  expenses: number; // in cents
}

interface CategoryBreakdown {
  name: string;
  value: number; // in pesos (for Recharts)
}

interface BudgetVariance {
  category: string;
  budgetAmount: number; // in cents
  actualAmount: number; // in cents
  variance: number; // in cents (positive = under budget)
  percentUsed: number; // 0-100
}

interface YearOverYear {
  currentYear: {
    income: number; // in cents
    expenses: number; // in cents
  };
  previousYear: {
    income: number; // in cents
    expenses: number; // in cents
  };
  change: {
    income: number; // in cents
    expenses: number; // in cents
  };
  percentChange: {
    income: number; // percentage
    expenses: number; // percentage
  };
}

interface Insights {
  avgMonthlySpending: number; // in cents
  largestTransactions: Array<{
    description: string;
    amount: number; // in cents
    date: string;
  }>;
  topCategories: Array<{
    name: string;
    amount: number; // in cents
  }>;
}

interface AnalyticsData {
  monthlyTrend: MonthlyTrendData[];
  categoryBreakdown: CategoryBreakdown[];
  totalIncome: number; // in cents
  totalExpenses: number; // in cents
  budgetVariance: BudgetVariance[];
  yearOverYear: YearOverYear;
  insights: Insights;
}

interface AnalyticsFilters {
  accountId?: string;
  categoryId?: string;
  type?: "income" | "expense";
}

export function useAnalytics(startDate: Date, endDate: Date, filters?: AnalyticsFilters) {
  return useQuery({
    queryKey: [
      "analytics",
      format(startDate, "yyyy-MM-dd"),
      format(endDate, "yyyy-MM-dd"),
      filters,
    ],
    queryFn: async (): Promise<AnalyticsData> => {
      // Base query with transfer exclusion
      let query = supabase
        .from("transactions")
        .select("*, categories(name)")
        .gte("date", format(startDate, "yyyy-MM-dd"))
        .lte("date", format(endDate, "yyyy-MM-dd"))
        .is("transfer_group_id", null); // CRITICAL: Exclude transfers!

      // Apply filters
      if (filters?.accountId) {
        query = query.eq("account_id", filters.accountId);
      }
      if (filters?.categoryId) {
        query = query.eq("category_id", filters.categoryId);
      }
      if (filters?.type) {
        query = query.eq("type", filters.type);
      }

      const { data: transactionData, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch analytics: ${error.message}`);
      }

      // Fetch budget data for variance
      const { data: budgetData, error: budgetError } = await supabase
        .from("budgets")
        .select("category_id, amount_cents, categories(name)")
        .gte("month", format(startOfMonth(startDate), "yyyy-MM-dd"))
        .lte("month", format(startOfMonth(endDate), "yyyy-MM-dd"));

      if (budgetError) {
        console.warn("Failed to fetch budgets:", budgetError);
      }

      // Fetch previous year data for YoY comparison
      const prevYearStart = subYears(startDate, 1);
      const prevYearEnd = subYears(endDate, 1);

      let prevQuery = supabase
        .from("transactions")
        .select("type, amount_cents")
        .gte("date", format(prevYearStart, "yyyy-MM-dd"))
        .lte("date", format(prevYearEnd, "yyyy-MM-dd"))
        .is("transfer_group_id", null);

      // Apply same filters for fair comparison
      if (filters?.accountId) {
        prevQuery = prevQuery.eq("account_id", filters.accountId);
      }
      if (filters?.categoryId) {
        prevQuery = prevQuery.eq("category_id", filters.categoryId);
      }
      if (filters?.type) {
        prevQuery = prevQuery.eq("type", filters.type);
      }

      const { data: prevYearData, error: prevYearError } = await prevQuery;

      if (prevYearError) {
        console.warn("Failed to fetch previous year data:", prevYearError);
      }

      // Process all data
      const monthlyTrend = processMonthlyTrend(transactionData || []);
      const categoryBreakdown = processCategoryBreakdown(transactionData || []);
      const totalIncome = calculateTotal(transactionData || [], "income");
      const totalExpenses = calculateTotal(transactionData || [], "expense");
      const budgetVariance = processBudgetVariance(budgetData || [], transactionData || []);
      const yearOverYear = processYearOverYear(transactionData || [], prevYearData || []);
      const insights = processInsights(transactionData || [], startDate, endDate);

      return {
        monthlyTrend,
        categoryBreakdown,
        totalIncome,
        totalExpenses,
        budgetVariance,
        yearOverYear,
        insights,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Helper: Group transactions by month
function processMonthlyTrend(data: Transaction[]): MonthlyTrendData[] {
  const grouped: Record<string, { income: number; expenses: number }> = {};

  data.forEach((t) => {
    const month = format(new Date(t.date), "MMM yyyy");
    if (!grouped[month]) {
      grouped[month] = { income: 0, expenses: 0 };
    }
    if (t.type === "income") {
      grouped[month].income += t.amount_cents;
    } else {
      grouped[month].expenses += t.amount_cents;
    }
  });

  return Object.entries(grouped)
    .map(([month, amounts]) => ({
      month,
      income: amounts.income,
      expenses: amounts.expenses,
    }))
    .sort((a, b) => {
      // Sort chronologically
      return new Date(a.month).getTime() - new Date(b.month).getTime();
    });
}

// Helper: Group by category and return top 10
function processCategoryBreakdown(data: Transaction[]): CategoryBreakdown[] {
  const grouped: Record<string, number> = {};

  data
    .filter((t) => t.type === "expense") // Only expenses for category breakdown
    .forEach((t) => {
      const categoryName = t.categories?.name || "Uncategorized";
      grouped[categoryName] = (grouped[categoryName] || 0) + t.amount_cents;
    });

  return Object.entries(grouped)
    .map(([name, totalCents]) => ({
      name,
      value: totalCents / 100, // Convert to pesos for Recharts display
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10); // Top 10 categories
}

// Helper: Calculate total for income or expense
function calculateTotal(data: Transaction[], type: "income" | "expense"): number {
  return data.filter((t) => t.type === type).reduce((sum, t) => sum + t.amount_cents, 0);
}

// Helper: Calculate budget variance
function processBudgetVariance(
  budgets: Array<{ category_id: string; amount_cents: number; categories: { name: string } }>,
  transactions: Transaction[]
): BudgetVariance[] {
  // Group transactions by category
  const spendingByCategory: Record<string, number> = {};

  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      spendingByCategory[t.category_id] = (spendingByCategory[t.category_id] || 0) + t.amount_cents;
    });

  // Calculate variance for each budget
  return budgets.map((budget) => {
    const actualSpend = spendingByCategory[budget.category_id] || 0;
    const variance = budget.amount_cents - actualSpend;
    const percentUsed = (actualSpend / budget.amount_cents) * 100;

    return {
      category: budget.categories.name,
      budgetAmount: budget.amount_cents,
      actualAmount: actualSpend,
      variance,
      percentUsed: Math.min(percentUsed, 100), // Cap at 100%
    };
  });
}

// Helper: Calculate year-over-year comparison
function processYearOverYear(
  currentData: Transaction[],
  previousData: Transaction[]
): YearOverYear {
  const currentIncome = calculateTotal(currentData, "income");
  const currentExpenses = calculateTotal(currentData, "expense");
  const previousIncome = calculateTotal(previousData, "income");
  const previousExpenses = calculateTotal(previousData, "expense");

  const incomeChange = currentIncome - previousIncome;
  const expenseChange = currentExpenses - previousExpenses;

  return {
    currentYear: {
      income: currentIncome,
      expenses: currentExpenses,
    },
    previousYear: {
      income: previousIncome,
      expenses: previousExpenses,
    },
    change: {
      income: incomeChange,
      expenses: expenseChange,
    },
    percentChange: {
      income: previousIncome > 0 ? (incomeChange / previousIncome) * 100 : 0,
      expenses: previousExpenses > 0 ? (expenseChange / previousExpenses) * 100 : 0,
    },
  };
}

// Helper: Generate insights
function processInsights(data: Transaction[], startDate: Date, endDate: Date): Insights {
  const expenses = data.filter((t) => t.type === "expense");

  // Calculate average monthly spending
  const monthCount = Math.max(1, Math.ceil(differenceInDays(endDate, startDate) / 30));
  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount_cents, 0);
  const avgMonthlySpending = totalExpenses / monthCount;

  // Get largest transactions
  const largestTransactions = expenses
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, 5)
    .map((t) => ({
      description: t.description,
      amount: t.amount_cents,
      date: t.date,
    }));

  // Get top categories
  const categoryTotals: Record<string, number> = {};
  expenses.forEach((t) => {
    const name = t.categories?.name || "Uncategorized";
    categoryTotals[name] = (categoryTotals[name] || 0) + t.amount_cents;
  });

  const topCategories = Object.entries(categoryTotals)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    avgMonthlySpending,
    largestTransactions,
    topCategories,
  };
}
```

---

## Step 3: Reuse Spending Trend Chart from Chunk 013 (Skip)

**Note**: `SpendingTrendChart.tsx` already exists from chunk 013. We will reuse it in the analytics dashboard.

**Verify it exists:**

```bash
test -f src/components/charts/SpendingTrendChart.tsx && echo "✅ Chart exists" || echo "❌ Complete chunk 013 first"
```

---

## Step 4: Reuse Category Pie Chart from Chunk 013 (Skip)

**Note**: `CategoryPieChart.tsx` already exists from chunk 013. We will reuse it.

**Verify it exists:**

```bash
test -f src/components/charts/CategoryPieChart.tsx && echo "✅ Chart exists" || echo "❌ Complete chunk 013 first"
```

---

## Step 5: Create Budget Progress Chart (15 min)

Create `src/components/charts/BudgetProgressChart.tsx`:

```typescript
import { formatPHP } from '@/lib/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingDown, TrendingUp, AlertCircle } from 'lucide-react';

interface BudgetVariance {
  category: string;
  budgetAmount: number; // cents
  actualAmount: number; // cents
  variance: number; // cents
  percentUsed: number; // 0-100
}

interface Props {
  data: BudgetVariance[];
}

export function BudgetProgressChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No budgets set for this period</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((budget) => {
        const isOverBudget = budget.percentUsed > 100;
        const isNearLimit = budget.percentUsed > 80 && budget.percentUsed <= 100;
        const progressColor = isOverBudget
          ? 'bg-red-500'
          : isNearLimit
          ? 'bg-yellow-500'
          : 'bg-green-500';

        return (
          <Card key={budget.category}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {budget.category}
                </CardTitle>
                {isOverBudget && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* Progress Bar */}
                <Progress
                  value={Math.min(budget.percentUsed, 100)}
                  className="h-2"
                  indicatorClassName={progressColor}
                />

                {/* Budget Details */}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {formatPHP(budget.actualAmount)} of {formatPHP(budget.budgetAmount)}
                  </span>
                  <span className={isOverBudget ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                    {budget.percentUsed.toFixed(0)}%
                  </span>
                </div>

                {/* Variance */}
                <div className="flex items-center gap-1 text-xs">
                  {budget.variance >= 0 ? (
                    <>
                      <TrendingDown className="h-3 w-3 text-green-600" />
                      <span className="text-green-600">
                        {formatPHP(budget.variance)} under budget
                      </span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-3 w-3 text-red-600" />
                      <span className="text-red-600">
                        {formatPHP(Math.abs(budget.variance))} over budget
                      </span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

---

## Step 6: Create Year-over-Year Chart (15 min)

Create `src/components/charts/YearOverYearChart.tsx`:

```typescript
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatPHP } from '@/lib/currency';

interface YearOverYear {
  currentYear: { income: number; expenses: number };
  previousYear: { income: number; expenses: number };
  change: { income: number; expenses: number };
  percentChange: { income: number; expenses: number };
}

interface Props {
  data: YearOverYear;
}

export function YearOverYearChart({ data }: Props) {
  const chartData = [
    {
      period: 'Previous Year',
      income: data.previousYear.income / 100,
      expenses: data.previousYear.expenses / 100,
    },
    {
      period: 'Current Year',
      income: data.currentYear.income / 100,
      expenses: data.currentYear.expenses / 100,
    },
  ];

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis />
          <Tooltip
            formatter={(value: number) => formatPHP(value * 100)}
            contentStyle={{ borderRadius: '8px' }}
          />
          <Legend />
          <Bar dataKey="income" fill="#10b981" name="Income" />
          <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
        </BarChart>
      </ResponsiveContainer>

      {/* Percentage Change Summary */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-1">
          <p className="text-muted-foreground">Income Change</p>
          <p className={`text-lg font-semibold ${data.percentChange.income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {data.percentChange.income >= 0 ? '+' : ''}
            {data.percentChange.income.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">
            {formatPHP(Math.abs(data.change.income))} {data.change.income >= 0 ? 'increase' : 'decrease'}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">Expense Change</p>
          <p className={`text-lg font-semibold ${data.percentChange.expenses <= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {data.percentChange.expenses >= 0 ? '+' : ''}
            {data.percentChange.expenses.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">
            {formatPHP(Math.abs(data.change.expenses))} {data.change.expenses >= 0 ? 'increase' : 'decrease'}
          </p>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 7: Create Insights Section (10 min)

Create `src/components/analytics/InsightsSection.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPHP } from '@/lib/currency';
import { TrendingUp, Calendar, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

interface Insights {
  avgMonthlySpending: number;
  largestTransactions: Array<{
    description: string;
    amount: number;
    date: string;
  }>;
  topCategories: Array<{
    name: string;
    amount: number;
  }>;
}

interface Props {
  insights: Insights;
}

export function InsightsSection({ insights }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Average Monthly Spending */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg. Monthly Spending</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatPHP(insights.avgMonthlySpending)}</div>
          <p className="text-xs text-muted-foreground mt-1">Per month on average</p>
        </CardContent>
      </Card>

      {/* Top Categories */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Top Spending Categories</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {insights.topCategories.slice(0, 3).map((cat) => (
              <div key={cat.name} className="flex justify-between text-sm">
                <span className="truncate">{cat.name}</span>
                <span className="font-medium">{formatPHP(cat.amount)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Largest Transaction */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Largest Transaction</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {insights.largestTransactions[0] && (
            <div className="space-y-1">
              <div className="text-2xl font-bold">
                {formatPHP(insights.largestTransactions[0].amount)}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {insights.largestTransactions[0].description}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(insights.largestTransactions[0].date), 'MMM d, yyyy')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Step 8: Create Filter Panel (10 min)

Create `src/components/analytics/FilterPanel.tsx`:

```typescript
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';

interface FilterPanelProps {
  onFilterChange: (filters: {
    accountId?: string;
    categoryId?: string;
    type?: 'income' | 'expense';
    startDate: Date;
    endDate: Date;
  }) => void;
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
}

export function FilterPanel({ onFilterChange, accounts, categories }: FilterPanelProps) {
  const [startDate, setStartDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1)
  );
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [accountId, setAccountId] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [type, setType] = useState<'income' | 'expense' | undefined>();

  const handleApplyFilters = () => {
    onFilterChange({
      accountId,
      categoryId,
      type,
      startDate,
      endDate,
    });
  };

  const handleClearFilters = () => {
    setAccountId(undefined);
    setCategoryId(undefined);
    setType(undefined);
    setStartDate(new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1));
    setEndDate(new Date());
    onFilterChange({
      startDate: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1),
      endDate: new Date(),
    });
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid gap-4 md:grid-cols-5">
          {/* Date Range */}
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, 'MMM d, yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>End Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(endDate, 'MMM d, yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Account Filter */}
          <div className="space-y-2">
            <Label>Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category Filter */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type Filter */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as 'income' | 'expense')}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4">
          <Button onClick={handleApplyFilters} className="flex-1">
            Apply Filters
          </Button>
          <Button onClick={handleClearFilters} variant="outline">
            <X className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Step 9: Create Analytics Dashboard Component (20 min)

Create `src/components/analytics/AnalyticsDashboard.tsx`:

```typescript
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalytics } from '@/hooks/useAnalytics';
import { SpendingTrendChart } from '@/components/charts/SpendingTrendChart';
import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { BudgetProgressChart } from '@/components/charts/BudgetProgressChart';
import { YearOverYearChart } from '@/components/charts/YearOverYearChart';
import { InsightsSection } from './InsightsSection';
import { FilterPanel } from './FilterPanel';
import { formatPHP } from '@/lib/currency';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { subMonths, startOfMonth, endOfMonth } from 'date-fns';

// Mock data - replace with actual data fetch
const mockAccounts = [
  { id: '1', name: 'Checking Account' },
  { id: '2', name: 'Savings Account' },
];

const mockCategories = [
  { id: '1', name: 'Groceries' },
  { id: '2', name: 'Transportation' },
  { id: '3', name: 'Entertainment' },
];

export function AnalyticsDashboard() {
  const [filters, setFilters] = useState({
    startDate: startOfMonth(subMonths(new Date(), 5)),
    endDate: endOfMonth(new Date()),
    accountId: undefined as string | undefined,
    categoryId: undefined as string | undefined,
    type: undefined as 'income' | 'expense' | undefined,
  });

  const { data, isLoading, error } = useAnalytics(
    filters.startDate,
    filters.endDate,
    {
      accountId: filters.accountId,
      categoryId: filters.categoryId,
      type: filters.type,
    }
  );

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
        <div className="text-lg text-red-600">
          Error loading analytics: {error.message}
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const netIncome = data.totalIncome - data.totalExpenses;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <FilterPanel
        onFilterChange={(newFilters) => setFilters({ ...filters, ...newFilters })}
        accounts={mockAccounts}
        categories={mockCategories}
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatPHP(data.totalIncome)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatPHP(data.totalExpenses)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Amount</CardTitle>
            <DollarSign className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                netIncome >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatPHP(Math.abs(netIncome))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {netIncome >= 0 ? 'Surplus' : 'Deficit'}
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
            <SpendingTrendChart data={data.monthlyTrend} />
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryPieChart data={data.categoryBreakdown} />
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
```

---

## Step 10: Create Analytics Route (5 min)

Create `src/routes/analytics.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';

export const Route = createFileRoute('/analytics')({
  component: Analytics,
});

function Analytics() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Financial Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Deep insights into your spending patterns and financial health
        </p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
```

---

## Step 11: Add Navigation Link (3 min)

Find your main navigation component (likely in `src/components/Layout.tsx` or `src/App.tsx`) and add analytics link:

```typescript
import { Link } from '@tanstack/react-router';
import { BarChart3 } from 'lucide-react';

// In your navigation component:
<nav className="flex gap-4">
  <Link to="/" className="flex items-center gap-2">
    <Home className="h-4 w-4" />
    Dashboard
  </Link>
  <Link to="/transactions" className="flex items-center gap-2">
    <Receipt className="h-4 w-4" />
    Transactions
  </Link>
  <Link to="/analytics" className="flex items-center gap-2">
    <BarChart3 className="h-4 w-4" />
    Analytics
  </Link>
</nav>
```

**Alternative**: If using shadcn/ui NavigationMenu, add:

```typescript
<NavigationMenuItem>
  <Link to="/analytics">
    <NavigationMenuLink className={navigationMenuTriggerStyle()}>
      Analytics
    </NavigationMenuLink>
  </Link>
</NavigationMenuItem>
```

---

## Step 12: Performance Optimization (10 min)

### 12.1 Lazy Load Charts

Update `src/components/analytics/AnalyticsDashboard.tsx`:

```typescript
import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy load heavy chart components
const SpendingTrendChart = lazy(() => import('@/components/charts/SpendingTrendChart').then(m => ({ default: m.SpendingTrendChart })));
const CategoryPieChart = lazy(() => import('@/components/charts/CategoryPieChart').then(m => ({ default: m.CategoryPieChart })));
const YearOverYearChart = lazy(() => import('@/components/charts/YearOverYearChart').then(m => ({ default: m.YearOverYearChart })));

// Use in render:
<Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
  <SpendingTrendChart data={data.monthlyTrend} />
</Suspense>
```

### 12.2 Memoize Expensive Calculations

In `useAnalytics.ts`, wrap processors:

```typescript
import { useMemo } from "react";

// In the queryFn:
const monthlyTrend = useMemo(() => processMonthlyTrend(transactionData || []), [transactionData]);
```

---

## Step 13: Accessibility Enhancements (5 min)

Add ARIA labels to charts:

```typescript
// In SpendingTrendChart.tsx (if you created a new one):
<ResponsiveContainer
  width="100%"
  height={300}
  role="img"
  aria-label="Spending trend chart showing income and expenses over the selected time period"
>
  {/* Chart content */}
</ResponsiveContainer>

// In CategoryPieChart.tsx:
<ResponsiveContainer
  role="img"
  aria-label="Pie chart showing expense breakdown by category"
>
  {/* Chart content */}
</ResponsiveContainer>
```

---

## Done!

### Verification Checklist

Before proceeding to `checkpoint.md`, verify:

- [ ] Analytics route `/analytics` loads without errors
- [ ] All 4 charts display correctly
- [ ] Filters change the displayed data
- [ ] Budget variance shows for categories with budgets
- [ ] Year-over-year comparison displays percentage changes
- [ ] Insights section shows correct calculations
- [ ] Transfers are excluded from all analytics (critical!)
- [ ] Performance is acceptable (<1s load time)

### Next Steps

1. Test the analytics dashboard with real data
2. Proceed to **checkpoint.md** for comprehensive verification
3. Run verification tests from **verification.md**

---

**Estimated total time**: 1.5-2 hours depending on familiarity with Recharts
