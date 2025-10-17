# Instructions: Basic Dashboard

Follow these steps in order. Estimated time: 90 minutes.

---

## Step 1: Install Recharts (5 min)

```bash
npm install recharts
# or
pnpm add recharts
```

---

## Step 2: Create Dashboard Data Hook (20 min)

Add to `src/lib/supabaseQueries.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

export interface DashboardData {
  summary: {
    totalIncomeCents: number;
    totalExpenseCents: number;
    netAmountCents: number;
    transactionCount: number;
    accountCount: number;
    totalBalanceCents: number;
    previousMonthIncomeCents: number;
    previousMonthExpenseCents: number;
    // Enhanced metrics (per DATABASE.md Monthly Summary Query spec)
    activeDays: number; // COUNT(DISTINCT date)
    uniqueCategories: number; // COUNT(DISTINCT category_id)
    clearedCount: number; // Cleared transaction count
    pendingCount: number; // Pending transaction count
  };
  monthlyTrend: Array<{
    month: string;
    incomeCents: number;
    expenseCents: number;
  }>;
  categoryBreakdown: Array<{
    categoryId: string; // For click navigation to filtered transactions
    categoryName: string;
    color: string;
    amountCents: number;
    percentOfTotal: number;
  }>;
  recentTransactions: any[]; // Use Transaction type from chunk 010
}

export function useDashboardData(currentMonth: Date) {
  return useQuery({
    queryKey: ["dashboard", format(currentMonth, "yyyy-MM")],
    queryFn: async (): Promise<DashboardData> => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const previousMonthStart = startOfMonth(subMonths(currentMonth, 1));
      const previousMonthEnd = endOfMonth(subMonths(currentMonth, 1));

      // 1. Fetch current month transactions (exclude transfers)
      const { data: currentTransactions, error: currentError } = await supabase
        .from("transactions")
        .select("id, amount_cents, type, category_id, status")
        .is("transfer_group_id", null) // Exclude transfers
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));

      if (currentError) throw currentError;

      // 2. Fetch previous month for comparison
      const { data: previousTransactions, error: previousError } = await supabase
        .from("transactions")
        .select("amount_cents, type")
        .is("transfer_group_id", null)
        .gte("date", format(previousMonthStart, "yyyy-MM-dd"))
        .lte("date", format(previousMonthEnd, "yyyy-MM-dd"));

      if (previousError) throw previousError;

      // 3. Fetch last 6 months for trend
      const sixMonthsAgo = subMonths(monthStart, 5);
      const { data: trendTransactions, error: trendError } = await supabase
        .from("transactions")
        .select("date, amount_cents, type")
        .is("transfer_group_id", null)
        .gte("date", format(sixMonthsAgo, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));

      if (trendError) throw trendError;

      // 4. Fetch categories for breakdown
      const { data: categories, error: categoriesError } = await supabase
        .from("categories")
        .select("id, name, color")
        .eq("is_active", true);

      if (categoriesError) throw categoriesError;

      // 5. Fetch accounts for count and total balance
      const { data: accounts, error: accountsError } = await supabase
        .from("accounts")
        .select("id, initial_balance_cents")
        .eq("is_active", true);

      if (accountsError) throw accountsError;

      // 6. Fetch all transactions for account balances
      const { data: allTransactions, error: allTransactionsError } = await supabase
        .from("transactions")
        .select("account_id, amount_cents, type");

      if (allTransactionsError) throw allTransactionsError;

      // 7. Fetch recent transactions (last 10)
      const { data: recentTransactions, error: recentError } = await supabase
        .from("transactions")
        .select(
          `
          *,
          account:accounts(id, name),
          category:categories(id, name, color)
        `
        )
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);

      if (recentError) throw recentError;

      // Calculate summary
      const totalIncome = currentTransactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount_cents, 0);

      const totalExpense = currentTransactions
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount_cents, 0);

      const previousIncome = previousTransactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount_cents, 0);

      const previousExpense = previousTransactions
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount_cents, 0);

      // Enhanced metrics per DATABASE.md Monthly Summary Query spec
      const uniqueDates = new Set(currentTransactions.map((t) => t.date));
      const uniqueCategoryIds = new Set(
        currentTransactions.filter((t) => t.category_id).map((t) => t.category_id)
      );
      const clearedTransactions = currentTransactions.filter((t) => t.status === "cleared");
      const pendingTransactions = currentTransactions.filter((t) => t.status === "pending");

      // Calculate total balance across all accounts
      const totalBalance = accounts.reduce((sum, account) => {
        const accountTransactions = allTransactions.filter((t) => t.account_id === account.id);
        const balance = accountTransactions.reduce((bal, t) => {
          return bal + (t.type === "income" ? t.amount_cents : -t.amount_cents);
        }, account.initial_balance_cents);
        return sum + balance;
      }, 0);

      // Calculate monthly trend
      const monthlyTrend: any[] = [];
      for (let i = 5; i >= 0; i--) {
        const month = subMonths(currentMonth, i);
        const monthKey = format(month, "yyyy-MM");
        const monthTransactions = trendTransactions.filter(
          (t) => format(new Date(t.date), "yyyy-MM") === monthKey
        );

        const income = monthTransactions
          .filter((t) => t.type === "income")
          .reduce((sum, t) => sum + t.amount_cents, 0);

        const expense = monthTransactions
          .filter((t) => t.type === "expense")
          .reduce((sum, t) => sum + t.amount_cents, 0);

        monthlyTrend.push({
          month: format(month, "MMM"),
          incomeCents: income,
          expenseCents: expense,
        });
      }

      // Calculate category breakdown
      const categoryTotals = new Map<string, number>();
      currentTransactions
        .filter((t) => t.type === "expense" && t.category_id)
        .forEach((t) => {
          const existing = categoryTotals.get(t.category_id) || 0;
          categoryTotals.set(t.category_id, existing + t.amount_cents);
        });

      const categoryBreakdown = Array.from(categoryTotals.entries())
        .map(([categoryId, amount]) => {
          const category = categories.find((c) => c.id === categoryId);
          return {
            categoryId, // Include for click navigation
            categoryName: category?.name || "Unknown",
            color: category?.color || "#6B7280",
            amountCents: amount,
            percentOfTotal: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
          };
        })
        .sort((a, b) => b.amountCents - a.amountCents)
        .slice(0, 10); // Top 10 categories

      return {
        summary: {
          totalIncomeCents: totalIncome,
          totalExpenseCents: totalExpense,
          netAmountCents: totalIncome - totalExpense,
          transactionCount: currentTransactions.length,
          accountCount: accounts.length,
          totalBalanceCents: totalBalance,
          previousMonthIncomeCents: previousIncome,
          previousMonthExpenseCents: previousExpense,
          // Enhanced metrics
          activeDays: uniqueDates.size,
          uniqueCategories: uniqueCategoryIds.size,
          clearedCount: clearedTransactions.length,
          pendingCount: pendingTransactions.length,
        },
        monthlyTrend,
        categoryBreakdown,
        recentTransactions,
      };
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}
```

---

## Step 3: Create Summary Cards Component (15 min)

Create `src/components/dashboard/SummaryCards.tsx`:

```typescript
import { formatPHP } from "@/lib/currency";
import { TrendingUp, TrendingDown, Wallet, ArrowUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  summary: {
    totalIncomeCents: number;
    totalExpenseCents: number;
    netAmountCents: number;
    accountCount: number;
    totalBalanceCents: number;
    previousMonthIncomeCents: number;
    previousMonthExpenseCents: number;
  };
}

export function SummaryCards({ summary }: Props) {
  const incomeChange = summary.previousMonthIncomeCents > 0
    ? ((summary.totalIncomeCents - summary.previousMonthIncomeCents) /
        summary.previousMonthIncomeCents) * 100
    : 0;

  const expenseChange = summary.previousMonthExpenseCents > 0
    ? ((summary.totalExpenseCents - summary.previousMonthExpenseCents) /
        summary.previousMonthExpenseCents) * 100
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total Income */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Income</p>
              <h3 className="text-2xl font-bold font-mono">
                {formatPHP(summary.totalIncomeCents)}
              </h3>
            </div>
          </div>
        </div>
        {Math.abs(incomeChange) > 0.01 && (
          <div className={`text-xs mt-2 flex items-center gap-1 ${
            incomeChange > 0 ? "text-green-600" : "text-red-600"
          }`}>
            {incomeChange > 0 ? "+" : ""}
            {incomeChange.toFixed(1)}% from last month
          </div>
        )}
      </Card>

      {/* Total Expenses */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
              <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Expenses</p>
              <h3 className="text-2xl font-bold font-mono">
                {formatPHP(summary.totalExpenseCents)}
              </h3>
            </div>
          </div>
        </div>
        {Math.abs(expenseChange) > 0.01 && (
          <div className={`text-xs mt-2 flex items-center gap-1 ${
            expenseChange > 0 ? "text-red-600" : "text-green-600"
          }`}>
            {expenseChange > 0 ? "+" : ""}
            {expenseChange.toFixed(1)}% from last month
          </div>
        )}
      </Card>

      {/* Net Amount */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${
              summary.netAmountCents >= 0
                ? "bg-blue-100 dark:bg-blue-900/20"
                : "bg-orange-100 dark:bg-orange-900/20"
            }`}>
              <ArrowUpDown className={`h-4 w-4 ${
                summary.netAmountCents >= 0
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-orange-600 dark:text-orange-400"
              }`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Net Amount</p>
              <h3 className={`text-2xl font-bold font-mono ${
                summary.netAmountCents >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}>
                {formatPHP(summary.netAmountCents)}
              </h3>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {summary.transactionCount} transactions this month
        </p>
      </Card>

      {/* Total Balance */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <Wallet className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Balance</p>
              <h3 className="text-2xl font-bold font-mono">
                {formatPHP(summary.totalBalanceCents)}
              </h3>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Across {summary.accountCount} {summary.accountCount === 1 ? "account" : "accounts"}
        </p>
      </Card>
    </div>
  );
}
```

---

## Step 4: Create Monthly Trend Chart (15 min)

Create `src/components/dashboard/MonthlyChart.tsx`:

```typescript
import { formatPHP } from "@/lib/currency";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";

interface Props {
  data: Array<{
    month: string;
    incomeCents: number;
    expenseCents: number;
  }>;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  return (
    <div className="bg-card border rounded-lg p-3 shadow-lg">
      <p className="font-semibold mb-2">{payload[0].payload.month}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm">Income: {formatPHP(payload[0].value)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-sm">Expenses: {formatPHP(payload[1].value)}</span>
        </div>
      </div>
    </div>
  );
}

export function MonthlyChart({ data }: Props) {
  // Convert cents to pesos for better Y-axis display
  const chartData = data.map((d) => ({
    ...d,
    income: d.incomeCents / 100,
    expense: d.expenseCents / 100,
  }));

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Monthly Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis
            tickFormatter={(value) => `₱${value.toLocaleString()}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="income"
            stroke="#10b981"
            strokeWidth={2}
            name="Income"
          />
          <Line
            type="monotone"
            dataKey="expense"
            stroke="#ef4444"
            strokeWidth={2}
            name="Expenses"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
```

---

## Step 5: Create Category Breakdown Chart (10 min)

**Note**: This component includes click handlers to navigate to filtered transaction view per category.

Create `src/components/dashboard/CategoryChart.tsx`:

```typescript
import { formatPHP } from "@/lib/currency";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { useNavigate } from "@tanstack/react-router";

interface Props {
  data: Array<{
    categoryId: string;
    categoryName: string;
    color: string;
    amountCents: number;
    percentOfTotal: number;
  }>;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div className="bg-card border rounded-lg p-3 shadow-lg">
      <p className="font-semibold">{data.categoryName}</p>
      <p className="text-sm">{formatPHP(data.amountCents)}</p>
      <p className="text-xs text-muted-foreground">
        {data.percentOfTotal.toFixed(1)}% of total
      </p>
    </div>
  );
}

export function CategoryChart({ data }: Props) {
  const navigate = useNavigate();

  const handleCategoryClick = (categoryId: string) => {
    // Navigate to transactions page filtered by category
    navigate({
      to: "/transactions",
      search: { category: categoryId },
    });
  };

  if (!data || data.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Spending by Category</h3>
        <div className="text-center py-12 text-muted-foreground">
          No spending data for this month
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Spending by Category</h3>
      <div className="flex flex-col md:flex-row items-center gap-4">
        {/* Pie Chart */}
        <div className="w-full md:w-1/2">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data}
                dataKey="amountCents"
                nameKey="categoryName"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ percentOfTotal }) => `${percentOfTotal.toFixed(0)}%`}
                onClick={(entry) => handleCategoryClick(entry.categoryId)}
                cursor="pointer"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend with click handlers */}
        <div className="w-full md:w-1/2 space-y-2">
          {data.slice(0, 5).map((category) => (
            <div
              key={category.categoryName}
              className="flex items-center justify-between cursor-pointer hover:bg-accent p-2 rounded transition-colors"
              onClick={() => handleCategoryClick(category.categoryId)}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="text-sm">{category.categoryName}</span>
              </div>
              <span className="text-sm font-mono">
                {formatPHP(category.amountCents)}
              </span>
            </div>
          ))}
          {data.length > 5 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              +{data.length - 5} more categories
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
```

---

## Step 6: Create Recent Transactions Component (10 min)

Create `src/components/dashboard/RecentTransactions.tsx`:

```typescript
import { formatPHP } from "@/lib/currency";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface Props {
  transactions: any[];  // Use Transaction type from chunk 010
}

export function RecentTransactions({ transactions }: Props) {
  if (!transactions || transactions.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
        <div className="text-center py-8 text-muted-foreground">
          No transactions yet
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Recent Transactions</h3>
        <Link to="/transactions">
          <Button variant="ghost" size="sm">
            View All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              {transaction.category && (
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: transaction.category.color }}
                />
              )}
              <div>
                <p className="font-medium">{transaction.description}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{format(new Date(transaction.date), "MMM d")}</span>
                  {transaction.account && (
                    <>
                      <span>•</span>
                      <span>{transaction.account.name}</span>
                    </>
                  )}
                  {transaction.category && (
                    <>
                      <span>•</span>
                      <span>{transaction.category.name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="text-right">
              <p
                className={`font-mono font-semibold ${
                  transaction.type === "income"
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {transaction.type === "income" ? "+" : "-"}
                {formatPHP(transaction.amount_cents)}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {transaction.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

---

## Step 7: Create Dashboard Page (15 min)

**Note**: MonthSelector component was created in chunk 012, step 2. If not yet implemented, complete chunk 012 first.

Create or update `src/routes/index.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { startOfMonth } from "date-fns";
import { MonthSelector } from "@/components/MonthSelector"; // Created in chunk 012
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { useDashboardData } from "@/lib/supabaseQueries";

export const Route = createFileRoute("/")({\n  component: DashboardPage,
});

function DashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const { data, isLoading } = useDashboardData(selectedMonth);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load dashboard data</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Financial overview
              </p>
            </div>
            <MonthSelector
              selectedMonth={selectedMonth}
              onChange={setSelectedMonth}
            />
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
```

---

## Done!

When dashboard displays with all components working, you're ready for the checkpoint.

**Next**: Run through `CHECKPOINT.md` to verify everything works.

---

## Notes

**CRITICAL**: Dashboard queries must exclude transfers (`WHERE transfer_group_id IS NULL`) to show accurate income/expense summaries.

**Performance**: Dashboard aggregates multiple queries. Ensure caching is working to avoid re-fetching on every render. The 30-second `staleTime` provides a good balance.

**Charts**: Recharts is responsive by default. Use `ResponsiveContainer` to ensure charts resize properly on mobile.
