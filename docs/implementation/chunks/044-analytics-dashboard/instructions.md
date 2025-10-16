# Instructions: Analytics Dashboard

Follow these steps in order. Estimated time: 1.5 hours.

---

## Step 1: Install Recharts (5 min)

```bash
npm install recharts date-fns
```

---

## Step 2: Create Analytics Hook (20 min)

Create `src/hooks/useAnalytics.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

export function useAnalytics(startDate: Date, endDate: Date) {
  return useQuery({
    queryKey: ["analytics", format(startDate, "yyyy-MM"), format(endDate, "yyyy-MM")],
    queryFn: async () => {
      // Monthly spending trend
      const { data: trendData } = await supabase
        .from("transactions")
        .select("date, amount_cents, type")
        .gte("date", format(startDate, "yyyy-MM-dd"))
        .lte("date", format(endDate, "yyyy-MM-dd"))
        .is("transfer_group_id", null); // CRITICAL: Exclude transfers!

      // Category breakdown
      const { data: categoryData } = await supabase
        .from("transactions")
        .select("category_id, categories(name), amount_cents")
        .eq("type", "expense")
        .gte("date", format(startDate, "yyyy-MM-dd"))
        .lte("date", format(endDate, "yyyy-MM-dd"))
        .is("transfer_group_id", null); // CRITICAL: Exclude transfers!

      // Process data
      const monthlyTrend = processMonthlyTrend(trendData);
      const categoryBreakdown = processCategoryBreakdown(categoryData);

      return {
        monthlyTrend,
        categoryBreakdown,
        totalIncome: calculateTotal(trendData, "income"),
        totalExpenses: calculateTotal(trendData, "expense"),
      };
    },
  });
}

function processMonthlyTrend(data) {
  // Group by month
  const grouped = data.reduce((acc, t) => {
    const month = format(new Date(t.date), "MMM yyyy");
    if (!acc[month]) {
      acc[month] = { month, income: 0, expenses: 0 };
    }
    if (t.type === "income") {
      acc[month].income += t.amount_cents;
    } else {
      acc[month].expenses += t.amount_cents;
    }
    return acc;
  }, {});

  return Object.values(grouped);
}

function processCategoryBreakdown(data) {
  // Group by category
  const grouped = data.reduce((acc, t) => {
    const categoryName = t.categories?.name || "Uncategorized";
    acc[categoryName] = (acc[categoryName] || 0) + t.amount_cents;
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([name, value]) => ({ name, value: value / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10); // Top 10
}

function calculateTotal(data, type) {
  return data.filter((t) => t.type === type).reduce((sum, t) => sum + t.amount_cents, 0) / 100;
}
```

---

## Step 3: Create Spending Trend Chart (15 min)

Create `src/components/charts/SpendingTrendChart.tsx`:

```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatPHP } from '@/lib/currency';

interface Props {
  data: Array<{
    month: string;
    income: number;
    expenses: number;
  }>;
}

export function SpendingTrendChart({ data }: Props) {
  const formatted = data.map(d => ({
    month: d.month,
    income: d.income / 100,
    expenses: d.expenses / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip
          formatter={(value: number) => formatPHP(value * 100)}
        />
        <Legend />
        <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} />
        <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

---

## Step 4: Create Category Pie Chart (15 min)

Create `src/components/charts/CategoryPieChart.tsx`:

```typescript
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatPHP } from '@/lib/currency';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface Props {
  data: Array<{
    name: string;
    value: number;
  }>;
}

export function CategoryPieChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={(entry) => entry.name}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => formatPHP(value * 100)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

---

## Step 5: Create Dashboard Component (20 min)

Create `src/components/Dashboard.tsx`:

```typescript
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SpendingTrendChart } from './charts/SpendingTrendChart';
import { CategoryPieChart } from './charts/CategoryPieChart';
import { useAnalytics } from '@/hooks/useAnalytics';
import { subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { formatPHP } from '@/lib/currency';
import { TrendingUp, TrendingDown, PieChart as PieChartIcon, ArrowUpDown } from 'lucide-react';

export function Dashboard() {
  const [dateRange] = useState({
    start: startOfMonth(subMonths(new Date(), 5)),
    end: endOfMonth(new Date()),
  });

  const { data, isLoading } = useAnalytics(dateRange.start, dateRange.end);

  if (isLoading) {
    return <div>Loading analytics...</div>;
  }

  const netIncome = (data?.totalIncome || 0) - (data?.totalExpenses || 0);

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
            <div className="text-2xl font-bold">
              {formatPHP((data?.totalIncome || 0) * 100)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPHP((data?.totalExpenses || 0) * 100)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Income</CardTitle>
            <ArrowUpDown className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPHP(netIncome * 100)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendingTrendChart data={data?.monthlyTrend || []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              Expenses by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryPieChart data={data?.categoryBreakdown || []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

---

## Step 6: Create Analytics Route (10 min)

Create `src/routes/analytics.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '@/components/Dashboard';

export const Route = createFileRoute('/analytics')({
  component: Analytics,
});

function Analytics() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Financial Analytics</h1>
      <Dashboard />
    </div>
  );
}
```

---

## Step 7: Add to Navigation (5 min)

Update your navigation to include analytics link:

```typescript
<nav>
  <NavLink to="/dashboard">Dashboard</NavLink>
  <NavLink to="/transactions">Transactions</NavLink>
  <NavLink to="/analytics">Analytics</NavLink>
</nav>
```

---

## Done!

When charts display and analytics work, proceed to checkpoint.

**Next**: `checkpoint.md`
