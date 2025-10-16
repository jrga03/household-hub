# Instructions: Budgets UI

Follow these steps in order. Estimated time: 1.5 hours.

---

## Step 1: Create Budget Hooks (20 min)

Create `src/hooks/useBudgets.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatPHP } from "@/lib/currency";

interface Budget {
  id: string;
  household_id: string;
  category_id: string;
  month: string;
  month_key: number;
  amount_cents: number;
  currency_code: string;
  created_at: string;
  updated_at: string;
}

export function useBudgets(householdId: string, monthKey: number) {
  return useQuery({
    queryKey: ["budgets", householdId, monthKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select(
          `
          *,
          categories (
            id,
            name,
            parent_id,
            color,
            icon
          )
        `
        )
        .eq("household_id", householdId)
        .eq("month_key", monthKey)
        .order("categories(name)");

      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (budget: Omit<Budget, "id" | "created_at" | "updated_at" | "month_key">) => {
      const { data, error } = await supabase.from("budgets").insert([budget]).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      // Extract month_key from month date
      const date = new Date(variables.month);
      const monthKey = date.getFullYear() * 100 + (date.getMonth() + 1);

      queryClient.invalidateQueries({
        queryKey: ["budgets", variables.household_id, monthKey],
      });
    },
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Budget> & { id: string }) => {
      const { data, error } = await supabase
        .from("budgets")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["budgets", data.household_id, data.month_key],
      });
    },
  });
}

export function useCopyBudgets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      householdId,
      fromMonth,
      toMonth,
    }: {
      householdId: string;
      fromMonth: string;
      toMonth: string;
    }) => {
      // Fetch previous month budgets
      const { data: previousBudgets, error: fetchError } = await supabase
        .from("budgets")
        .select("category_id, amount_cents")
        .eq("household_id", householdId)
        .eq("month", fromMonth);

      if (fetchError) throw fetchError;

      // Upsert into new month
      const newBudgets = previousBudgets.map((b) => ({
        household_id: householdId,
        category_id: b.category_id,
        month: toMonth,
        amount_cents: b.amount_cents,
      }));

      const { data, error } = await supabase
        .from("budgets")
        .upsert(newBudgets, {
          onConflict: "household_id,category_id,month",
        })
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      const date = new Date(variables.toMonth);
      const monthKey = date.getFullYear() * 100 + (date.getMonth() + 1);

      queryClient.invalidateQueries({
        queryKey: ["budgets", variables.householdId, monthKey],
      });
    },
  });
}
```

Create `src/hooks/useBudgetActuals.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface BudgetComparison {
  category_id: string;
  category_name: string;
  target: number;
  actual: number;
  remaining: number;
  percentage: number;
  status: "under" | "near" | "over";
}

export function useBudgetActuals(householdId: string, month: string) {
  return useQuery({
    queryKey: ["budget-actuals", householdId, month],
    queryFn: async () => {
      // Fetch budgets for the month
      const { data: budgets, error: budgetError } = await supabase
        .from("budgets")
        .select(
          `
          category_id,
          amount_cents,
          categories (
            name
          )
        `
        )
        .eq("household_id", householdId)
        .eq("month", month);

      if (budgetError) throw budgetError;

      // Calculate actual spending per category
      const startOfMonth = new Date(month);
      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);
      endOfMonth.setDate(0); // Last day of month

      const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select("category_id, amount_cents")
        .eq("household_id", householdId)
        .eq("type", "expense")
        .gte("date", startOfMonth.toISOString().split("T")[0])
        .lte("date", endOfMonth.toISOString().split("T")[0])
        .is("transfer_group_id", null); // CRITICAL: Exclude transfers

      if (txError) throw txError;

      // Group transactions by category
      const actualsByCategory = transactions.reduce(
        (acc, tx) => {
          acc[tx.category_id] = (acc[tx.category_id] || 0) + tx.amount_cents;
          return acc;
        },
        {} as Record<string, number>
      );

      // Combine budgets with actuals
      const comparisons: BudgetComparison[] = budgets.map((budget) => {
        const actual = actualsByCategory[budget.category_id] || 0;
        const remaining = budget.amount_cents - actual;
        const percentage = budget.amount_cents > 0 ? (actual / budget.amount_cents) * 100 : 0;

        let status: "under" | "near" | "over";
        if (percentage < 80) status = "under";
        else if (percentage <= 100) status = "near";
        else status = "over";

        return {
          category_id: budget.category_id,
          category_name: budget.categories.name,
          target: budget.amount_cents,
          actual,
          remaining,
          percentage,
          status,
        };
      });

      return comparisons;
    },
    staleTime: 1 * 60 * 1000, // 1 minute (refreshes frequently)
  });
}
```

---

## Step 2: Create Budget Form Component (25 min)

Create `src/components/budgets/BudgetForm.tsx`:

```typescript
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateBudget, useUpdateBudget } from '@/hooks/useBudgets';
import { toast } from 'sonner';

const schema = z.object({
  category_id: z.string().min(1, 'Category is required'),
  amount_cents: z.number().min(0, 'Amount must be positive').max(999999999, 'Amount too large'),
  month: z.string().regex(/^\d{4}-\d{2}-01$/, 'Invalid month format'),
});

type FormData = z.infer<typeof schema>;

interface BudgetFormProps {
  householdId: string;
  month: string;
  categories: Array<{ id: string; name: string }>;
  existingBudget?: {
    id: string;
    category_id: string;
    amount_cents: number;
  };
  onSuccess?: () => void;
}

export function BudgetForm({
  householdId,
  month,
  categories,
  existingBudget,
  onSuccess,
}: BudgetFormProps) {
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      category_id: existingBudget?.category_id || '',
      amount_cents: existingBudget?.amount_cents || 0,
      month,
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      if (existingBudget) {
        await updateBudget.mutateAsync({
          id: existingBudget.id,
          amount_cents: data.amount_cents,
        });
        toast.success('Budget updated successfully');
      } else {
        await createBudget.mutateAsync({
          household_id: householdId,
          category_id: data.category_id,
          month: data.month,
          amount_cents: data.amount_cents,
          currency_code: 'PHP',
        });
        toast.success('Budget created successfully');
      }
      form.reset();
      onSuccess?.();
    } catch (error) {
      toast.error('Failed to save budget');
      console.error(error);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="category" className="text-sm font-medium">
          Category
        </label>
        <Controller
          name="category_id"
          control={form.control}
          render={({ field, fieldState }) => (
            <>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={!!existingBudget} // Can't change category on edit
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldState.error && (
                <p className="mt-1.5 text-sm text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </>
          )}
        />
      </div>

      <div>
        <label htmlFor="amount" className="text-sm font-medium">
          Target Amount
        </label>
        <Controller
          name="amount_cents"
          control={form.control}
          render={({ field, fieldState }) => (
            <CurrencyInput
              id="amount"
              {...field}
              error={fieldState.error?.message}
            />
          )}
        />
      </div>

      <Button
        type="submit"
        disabled={createBudget.isPending || updateBudget.isPending}
      >
        {existingBudget ? 'Update Budget' : 'Create Budget'}
      </Button>
    </form>
  );
}
```

---

## Step 3: Create Budget Progress Component (15 min)

Create `src/components/budgets/BudgetProgressBar.tsx`:

```typescript
import { Progress } from '@/components/ui/progress';
import { formatPHP } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface BudgetProgressBarProps {
  target: number;
  actual: number;
  categoryName: string;
}

export function BudgetProgressBar({
  target,
  actual,
  categoryName,
}: BudgetProgressBarProps) {
  const percentage = target > 0 ? (actual / target) * 100 : 0;
  const remaining = target - actual;

  const status = percentage < 80 ? 'under' : percentage <= 100 ? 'near' : 'over';

  const statusColors = {
    under: 'text-green-600 bg-green-100 dark:bg-green-900/20',
    near: 'text-amber-600 bg-amber-100 dark:bg-amber-900/20',
    over: 'text-red-600 bg-red-100 dark:bg-red-900/20',
  };

  const progressColors = {
    under: 'bg-green-600',
    near: 'bg-amber-500',
    over: 'bg-red-600',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{categoryName}</span>
        <span className={cn('text-sm font-semibold px-2 py-1 rounded', statusColors[status])}>
          {percentage.toFixed(0)}%
        </span>
      </div>

      <Progress
        value={Math.min(percentage, 100)}
        className="h-2"
        indicatorClassName={progressColors[status]}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {formatPHP(actual)} of {formatPHP(target)}
        </span>
        <span>
          {remaining >= 0
            ? `${formatPHP(remaining)} remaining`
            : `${formatPHP(Math.abs(remaining))} over`}
        </span>
      </div>
    </div>
  );
}
```

---

## Step 4: Create Budget List Component (20 min)

Create `src/components/budgets/BudgetList.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Plus } from 'lucide-react';
import { BudgetProgressBar } from './BudgetProgressBar';
import { useBudgetActuals } from '@/hooks/useBudgetActuals';
import { useCopyBudgets } from '@/hooks/useBudgets';
import { formatPHP } from '@/lib/currency';
import { toast } from 'sonner';

interface BudgetListProps {
  householdId: string;
  month: string;
  onAddBudget: () => void;
}

export function BudgetList({
  householdId,
  month,
  onAddBudget,
}: BudgetListProps) {
  const { data: budgetActuals, isLoading } = useBudgetActuals(householdId, month);
  const copyBudgets = useCopyBudgets();

  // Calculate previous month
  const currentDate = new Date(month);
  const previousMonth = new Date(currentDate);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const previousMonthStr = previousMonth.toISOString().split('T')[0].substring(0, 7) + '-01';

  const handleCopyPreviousMonth = async () => {
    try {
      await copyBudgets.mutateAsync({
        householdId,
        fromMonth: previousMonthStr,
        toMonth: month,
      });
      toast.success('Budgets copied from previous month');
    } catch (error) {
      toast.error('Failed to copy budgets');
      console.error(error);
    }
  };

  if (isLoading) {
    return <div>Loading budgets...</div>;
  }

  if (!budgetActuals || budgetActuals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Budgets Set</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Set monthly spending targets to track your progress.
          </p>
          <div className="flex gap-2">
            <Button onClick={onAddBudget}>
              <Plus className="w-4 h-4 mr-2" />
              Add Budget
            </Button>
            <Button variant="outline" onClick={handleCopyPreviousMonth}>
              <Copy className="w-4 h-4 mr-2" />
              Copy from Previous Month
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalTarget = budgetActuals.reduce((sum, b) => sum + b.target, 0);
  const totalActual = budgetActuals.reduce((sum, b) => sum + b.actual, 0);
  const totalRemaining = totalTarget - totalActual;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Budget Overview</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onAddBudget}>
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopyPreviousMonth}>
                <Copy className="w-4 h-4 mr-2" />
                Copy Previous
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-sm text-muted-foreground">Total Budget</p>
              <p className="text-2xl font-bold">{formatPHP(totalTarget)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Spent</p>
              <p className="text-2xl font-bold">{formatPHP(totalActual)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remaining</p>
              <p className={`text-2xl font-bold ${totalRemaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatPHP(Math.abs(totalRemaining))}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {budgetActuals.map(budget => (
              <BudgetProgressBar
                key={budget.category_id}
                target={budget.target}
                actual={budget.actual}
                categoryName={budget.category_name}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Step 5: Create Budgets Route (10 min)

Create `src/routes/budgets.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { BudgetList } from '@/components/budgets/BudgetList';
import { BudgetForm } from '@/components/budgets/BudgetForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const Route = createFileRoute('/budgets')({
  component: BudgetsPage,
});

function BudgetsPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const householdId = '00000000-0000-0000-0000-000000000001'; // Default household

  const handlePreviousMonth = () => {
    const date = new Date(selectedMonth);
    date.setMonth(date.getMonth() - 1);
    setSelectedMonth(date.toISOString().split('T')[0].substring(0, 7) + '-01');
  };

  const handleNextMonth = () => {
    const date = new Date(selectedMonth);
    date.setMonth(date.getMonth() + 1);
    setSelectedMonth(date.toISOString().split('T')[0].substring(0, 7) + '-01');
  };

  const formatMonthDisplay = (monthStr: string) => {
    const date = new Date(monthStr);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Budgets</h1>

        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-lg font-medium w-48 text-center">
            {formatMonthDisplay(selectedMonth)}
          </span>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <BudgetList
        householdId={householdId}
        month={selectedMonth}
        onAddBudget={() => setIsAddDialogOpen(true)}
      />

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Budget</DialogTitle>
          </DialogHeader>
          <BudgetForm
            householdId={householdId}
            month={selectedMonth}
            categories={[]} // TODO: Fetch from categories hook
            onSuccess={() => setIsAddDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

---

## Done!

When all components work, you're ready for the checkpoint.

**Next**: Run through `CHECKPOINT.md` to verify everything works.
