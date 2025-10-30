# Instructions: Category Totals

Follow these steps in order. Estimated time: 60 minutes.

---

## Step 1: Create Category Totals Query Hook (15 min)

Add to `src/lib/supabaseQueries.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { startOfMonth, endOfMonth, format } from "date-fns";

export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  parentId: string | null;
  parentName: string | null;
  color: string;
  expenseCents: number;
  incomeCents: number;
  transactionCount: number;
  percentOfTotal: number;
}

export interface CategoryTotalGroup {
  parentId: string | null;
  parentName: string;
  parentColor: string;
  totalExpenseCents: number;
  children: CategoryTotal[];
  // Note: Child categories track incomeCents, but MVP displays expense-focused analytics only.
  // Income analysis can be added in Phase B by utilizing the incomeCents field.
}

export function useCategoryTotals(month: Date) {
  return useQuery({
    queryKey: ["category-totals", format(month, "yyyy-MM")],
    queryFn: async (): Promise<CategoryTotalGroup[]> => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      // Fetch all categories with hierarchy
      const { data: categories, error: categoriesError } = await supabase
        .from("categories")
        .select("id, name, parent_id, color")
        .eq("is_active", true)
        .order("sort_order");

      if (categoriesError) throw categoriesError;

      // Fetch transactions for this month
      // CRITICAL: Exclude transfers from analytics
      const { data: transactions, error: transactionsError } = await supabase
        .from("transactions")
        .select("category_id, amount_cents, type")
        .is("transfer_group_id", null) // ← Exclude transfers
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));

      if (transactionsError) throw transactionsError;

      // Build category totals map
      const totalsMap = new Map<
        string,
        {
          expense: number;
          income: number;
          count: number;
        }
      >();

      transactions.forEach((t) => {
        if (!t.category_id) return;

        const existing = totalsMap.get(t.category_id) || {
          expense: 0,
          income: 0,
          count: 0,
        };

        if (t.type === "expense") {
          existing.expense += t.amount_cents;
        } else {
          existing.income += t.amount_cents;
        }
        existing.count++;

        totalsMap.set(t.category_id, existing);
      });

      // Calculate total spending for percentages
      const totalSpending = Array.from(totalsMap.values()).reduce((sum, t) => sum + t.expense, 0);

      // Group by parent categories
      const parentMap = new Map<string | null, CategoryTotalGroup>();

      categories.forEach((category) => {
        // Skip parent categories (they don't have transactions directly)
        if (!category.parent_id) {
          // Initialize parent group
          if (!parentMap.has(category.id)) {
            parentMap.set(category.id, {
              parentId: category.id,
              parentName: category.name,
              parentColor: category.color,
              totalExpenseCents: 0,
              children: [],
            });
          }
          return;
        }

        // This is a child category
        const totals = totalsMap.get(category.id) || {
          expense: 0,
          income: 0,
          count: 0,
        };

        const parent = categories.find((c) => c.id === category.parent_id);
        const parentKey = category.parent_id;

        if (!parentMap.has(parentKey)) {
          parentMap.set(parentKey, {
            parentId: parentKey,
            parentName: parent?.name || "Uncategorized",
            parentColor: parent?.color || "#6B7280",
            totalExpenseCents: 0,
            children: [],
          });
        }

        const group = parentMap.get(parentKey)!;
        group.totalExpenseCents += totals.expense;
        group.children.push({
          categoryId: category.id,
          categoryName: category.name,
          parentId: category.parent_id,
          parentName: parent?.name || null,
          color: category.color,
          expenseCents: totals.expense,
          incomeCents: totals.income,
          transactionCount: totals.count,
          percentOfTotal: totalSpending > 0 ? (totals.expense / totalSpending) * 100 : 0,
        });
      });

      // Convert map to array and sort by total expense
      return Array.from(parentMap.values()).sort(
        (a, b) => b.totalExpenseCents - a.totalExpenseCents
      );
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

// Helper: Get totals for previous month for comparison
export function useCategoryTotalsComparison(currentMonth: Date, previousMonth: Date) {
  const current = useCategoryTotals(currentMonth);
  const previous = useCategoryTotals(previousMonth);

  return {
    current,
    previous,
    isLoading: current.isLoading || previous.isLoading,
  };
}
```

---

## Step 2: Create Month Selector Component (10 min)

Create `src/components/MonthSelector.tsx`:

```typescript
import { format, addMonths, subMonths, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  selectedMonth: Date;
  onChange: (month: Date) => void;
}

export function MonthSelector({ selectedMonth, onChange }: Props) {
  const currentMonth = startOfMonth(new Date());
  const isCurrentMonth = format(selectedMonth, "yyyy-MM") === format(currentMonth, "yyyy-MM");

  const handlePrevious = () => {
    onChange(subMonths(selectedMonth, 1));
  };

  const handleNext = () => {
    onChange(addMonths(selectedMonth, 1));
  };

  const handleCurrent = () => {
    onChange(currentMonth);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrevious}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold min-w-[120px] text-center">
          {format(selectedMonth, "MMMM yyyy")}
        </span>
        {!isCurrentMonth && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCurrent}
          >
            Current
          </Button>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleNext}
        disabled={format(addMonths(selectedMonth, 1), "yyyy-MM") > format(currentMonth, "yyyy-MM")}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

---

## Step 3: Create Category Total Card Component (10 min)

Create `src/components/CategoryTotalCard.tsx`:

```typescript
import { formatPHP } from "@/lib/currency";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Props {
  category: {
    categoryName: string;
    color: string;
    expenseCents: number;
    incomeCents: number;
    transactionCount: number;
    percentOfTotal: number;
  };
  previousExpenseCents?: number;
}

export function CategoryTotalCard({ category, previousExpenseCents }: Props) {
  const change = previousExpenseCents
    ? ((category.expenseCents - previousExpenseCents) / previousExpenseCents) * 100
    : 0;

  const hasIncrease = change > 0;
  const hasChange = Math.abs(change) > 0.01;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: category.color }}
          />
          <h4 className="font-medium">{category.categoryName}</h4>
        </div>
        <div className="text-right">
          <div className="font-mono font-semibold text-lg">
            {formatPHP(category.expenseCents)}
          </div>
          <div className="text-xs text-muted-foreground">
            {category.transactionCount} transactions
          </div>
        </div>
      </div>

      {/* Progress bar showing percentage of total */}
      <div className="mb-2">
        <Progress
          value={category.percentOfTotal}
          className="h-2"
          style={{
            "--progress-background": category.color,
          } as React.CSSProperties}
        />
        <div className="text-xs text-muted-foreground mt-1">
          {category.percentOfTotal.toFixed(1)}% of total spending
        </div>
      </div>

      {/* Comparison with previous month */}
      {hasChange && previousExpenseCents !== undefined && (
        <div className="flex items-center gap-1 text-sm">
          {hasIncrease ? (
            <TrendingUp className="h-3 w-3 text-red-600" />
          ) : (
            <TrendingDown className="h-3 w-3 text-green-600" />
          )}
          <span className={hasIncrease ? "text-red-600" : "text-green-600"}>
            {Math.abs(change).toFixed(1)}% {hasIncrease ? "increase" : "decrease"}
          </span>
          <span className="text-muted-foreground">from last month</span>
        </div>
      )}
    </Card>
  );
}
```

---

## Step 4: Create Category Group Component (10 min)

Create `src/components/CategoryTotalsGroup.tsx`:

```typescript
import { formatPHP } from "@/lib/currency";
import { CategoryTotalCard } from "@/components/CategoryTotalCard";
import type { CategoryTotalGroup } from "@/lib/supabaseQueries";

interface Props {
  group: CategoryTotalGroup;
  previousMonthData?: CategoryTotalGroup;
}

export function CategoryTotalsGroup({ group, previousMonthData }: Props) {
  return (
    <div className="space-y-3">
      {/* Parent Category Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted rounded-lg">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: group.parentColor }}
          />
          <h3 className="font-semibold text-lg">{group.parentName}</h3>
        </div>
        <div className="font-mono font-bold text-lg">
          {formatPHP(group.totalExpenseCents)}
        </div>
      </div>

      {/* Child Categories */}
      <div className="grid gap-3 md:grid-cols-2">
        {group.children.map((child) => {
          const previousChild = previousMonthData?.children.find(
            (c) => c.categoryId === child.categoryId
          );

          return (
            <CategoryTotalCard
              key={child.categoryId}
              category={child}
              previousExpenseCents={previousChild?.expenseCents}
            />
          );
        })}
      </div>
    </div>
  );
}
```

---

## Step 5: Create Category Analytics Page (15 min)

Create `src/routes/analytics/categories.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { startOfMonth, subMonths } from "date-fns";
import { MonthSelector } from "@/components/MonthSelector";
import { CategoryTotalsGroup } from "@/components/CategoryTotalsGroup";
import { useCategoryTotalsComparison } from "@/lib/supabaseQueries";
import { formatPHP } from "@/lib/currency";

export const Route = createFileRoute("/analytics/categories")({\n  component: CategoryAnalyticsPage,
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
          <p className="text-lg font-medium text-destructive">
            Failed to load category data
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {current.error?.message || previous.error?.message}
          </p>
        </div>
      </div>
    );
  }

  // Calculate total spending for the month
  const totalSpending = current.data?.reduce(
    (sum, group) => sum + group.totalExpenseCents,
    0
  ) || 0;

  const previousTotalSpending = previous.data?.reduce(
    (sum, group) => sum + group.totalExpenseCents,
    0
  ) || 0;

  const spendingChange = previousTotalSpending > 0
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
              <p className="text-sm text-muted-foreground">
                Monthly spending by category
              </p>
            </div>
            <MonthSelector
              selectedMonth={selectedMonth}
              onChange={setSelectedMonth}
            />
          </div>

          {/* Summary Card */}
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Total Spending</div>
                <div className="text-2xl font-bold font-mono">
                  {formatPHP(totalSpending)}
                </div>
              </div>
              {previousTotalSpending > 0 && (
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">vs Last Month</div>
                  <div className={`text-lg font-semibold ${
                    spendingChange > 0 ? "text-red-600" : "text-green-600"
                  }`}>
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
              const previousGroup = previous.data?.find(
                (g) => g.parentId === group.parentId
              );

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
```

---

## Done!

When category totals display correctly with parent rollups and month comparison, you're ready for the checkpoint.

**Next**: Run through `CHECKPOINT.md` to verify everything works.

---

## Notes

**CRITICAL**: Unlike account balance queries, category analytics MUST exclude transfer transactions (`WHERE transfer_group_id IS NULL`). Transfers are movements between accounts, not real income or expenses.

**Performance**: With the `idx_transactions_category_date` and `idx_transactions_month` indexes, category total queries should complete in <100ms even with 1000+ transactions per month.

**Parent Rollups**: Parent categories don't have transactions directly - their totals are calculated by summing all child categories. This maintains the two-level hierarchy.
