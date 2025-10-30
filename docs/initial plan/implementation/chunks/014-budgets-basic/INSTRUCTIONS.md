# Instructions: Budgets Basic

Follow these steps in order. Estimated time: 120 minutes.

---

## Step 1: Create Budgets Query Hooks (25 min)

Add to `src/lib/supabaseQueries.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { startOfMonth, endOfMonth, format } from "date-fns";

export interface Budget {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  parentCategoryName: string;
  budgetAmountCents: number;
  actualSpentCents: number;
  remainingCents: number;
  percentUsed: number;
  isOverBudget: boolean;
}

export interface BudgetGroup {
  parentName: string;
  parentColor: string;
  totalBudgetCents: number;
  totalSpentCents: number;
  budgets: Budget[];
}

export function useBudgets(month: Date) {
  return useQuery({
    queryKey: ["budgets", format(month, "yyyy-MM")],
    queryFn: async (): Promise<BudgetGroup[]> => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const monthKey = format(monthStart, "yyyy-MM-dd");

      // 1. Fetch budgets for this month
      const { data: budgets, error: budgetsError } = await supabase
        .from("budgets")
        .select(
          `
          id,
          category_id,
          amount_cents,
          categories(id, name, color, parent_id)
        `
        )
        .eq("month", monthKey);

      if (budgetsError) throw budgetsError;

      // 2. Fetch parent categories
      const { data: parents, error: parentsError } = await supabase
        .from("categories")
        .select("id, name, color")
        .is("parent_id", null);

      if (parentsError) throw parentsError;

      // 3. Fetch actual spending for these categories
      // CRITICAL: Exclude transfers from spending calculation
      const categoryIds = budgets.map((b) => b.categories.id);

      const { data: transactions, error: transactionsError } = await supabase
        .from("transactions")
        .select("category_id, amount_cents, type")
        .in("category_id", categoryIds)
        .is("transfer_group_id", null) // ← Exclude transfers
        .eq("type", "expense")
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));

      if (transactionsError) throw transactionsError;

      // Calculate spending per category
      const spendingMap = new Map<string, number>();
      transactions.forEach((t) => {
        const existing = spendingMap.get(t.category_id) || 0;
        spendingMap.set(t.category_id, existing + t.amount_cents);
      });

      // Build budget objects
      const budgetObjects: Budget[] = budgets.map((b) => {
        const category = b.categories;
        const parent = parents.find((p) => p.id === category.parent_id);
        const actualSpent = spendingMap.get(category.id) || 0;
        const remaining = b.amount_cents - actualSpent;
        const percentUsed = b.amount_cents > 0 ? (actualSpent / b.amount_cents) * 100 : 0;

        return {
          id: b.id,
          categoryId: category.id,
          categoryName: category.name,
          categoryColor: category.color,
          parentCategoryName: parent?.name || "Uncategorized",
          budgetAmountCents: b.amount_cents,
          actualSpentCents: actualSpent,
          remainingCents: remaining,
          percentUsed,
          isOverBudget: actualSpent > b.amount_cents,
        };
      });

      // Group by parent category
      const groupMap = new Map<string, BudgetGroup>();

      budgetObjects.forEach((budget) => {
        const parentName = budget.parentCategoryName;

        if (!groupMap.has(parentName)) {
          const parent = parents.find((p) => p.name === parentName);
          groupMap.set(parentName, {
            parentName,
            parentColor: parent?.color || "#6B7280",
            totalBudgetCents: 0,
            totalSpentCents: 0,
            budgets: [],
          });
        }

        const group = groupMap.get(parentName)!;
        group.totalBudgetCents += budget.budgetAmountCents;
        group.totalSpentCents += budget.actualSpentCents;
        group.budgets.push(budget);
      });

      return Array.from(groupMap.values());
    },
    staleTime: 30 * 1000,
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { categoryId: string; month: Date; amountCents: number }) => {
      const monthKey = format(startOfMonth(data.month), "yyyy-MM-dd");

      const { data: budget, error } = await supabase
        .from("budgets")
        .insert({
          category_id: data.categoryId,
          month: monthKey,
          amount_cents: data.amountCents,
        })
        .select()
        .single();

      if (error) throw error;
      return budget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; amountCents: number }) => {
      const { data: budget, error } = await supabase
        .from("budgets")
        .update({ amount_cents: data.amountCents })
        .eq("id", data.id)
        .select()
        .single();

      if (error) throw error;
      return budget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (budgetId: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", budgetId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

export function useCopyBudgets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { fromMonth: Date; toMonth: Date }) => {
      const fromKey = format(startOfMonth(data.fromMonth), "yyyy-MM-dd");
      const toKey = format(startOfMonth(data.toMonth), "yyyy-MM-dd");

      // Fetch budgets from previous month
      const { data: existingBudgets, error: fetchError } = await supabase
        .from("budgets")
        .select("category_id, amount_cents")
        .eq("month", fromKey);

      if (fetchError) throw fetchError;

      if (!existingBudgets || existingBudgets.length === 0) {
        throw new Error("No budgets found for previous month");
      }

      // Insert budgets for new month
      const newBudgets = existingBudgets.map((b) => ({
        category_id: b.category_id,
        month: toKey,
        amount_cents: b.amount_cents,
      }));

      const { error: insertError } = await supabase.from("budgets").insert(newBudgets);

      if (insertError) throw insertError;

      return newBudgets.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}
```

---

## Step 2: Create Budget Progress Component (15 min)

**First, install shadcn/ui Progress component:**

```bash
npx shadcn-ui@latest add progress
```

Create `src/components/budgets/BudgetProgress.tsx`:

```typescript
import { formatPHP } from "@/lib/currency";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Props {
  budgetAmountCents: number;
  actualSpentCents: number;
  percentUsed: number;
  isOverBudget: boolean;
}

export function BudgetProgress({
  budgetAmountCents,
  actualSpentCents,
  percentUsed,
  isOverBudget,
}: Props) {
  const getProgressColor = () => {
    if (isOverBudget) return "bg-red-500";
    if (percentUsed >= 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getTextColor = () => {
    if (isOverBudget) return "text-red-600";
    if (percentUsed >= 80) return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <div className="space-y-2">
      {/* Progress Bar */}
      <Progress
        value={Math.min(percentUsed, 100)}
        className={cn("h-3", getProgressColor())}
      />

      {/* Stats */}
      <div className="flex items-center justify-between text-sm">
        <div className={cn("font-medium", getTextColor())}>
          {formatPHP(actualSpentCents)} spent
        </div>
        <div className="text-muted-foreground">
          of {formatPHP(budgetAmountCents)}
        </div>
      </div>

      {/* Percentage or Over Budget Warning */}
      {isOverBudget ? (
        <div className="text-xs text-red-600 font-medium">
          ⚠️ Over budget by {formatPHP(actualSpentCents - budgetAmountCents)}
        </div>
      ) : (
        <div className={cn("text-xs", getTextColor())}>
          {percentUsed.toFixed(1)}% used • {formatPHP(budgetAmountCents - actualSpentCents)} remaining
        </div>
      )}
    </div>
  );
}
```

---

## Step 3: Create Budget Card Component (15 min)

Create `src/components/budgets/BudgetCard.tsx`:

```typescript
import { formatPHP } from "@/lib/currency";
import { Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BudgetProgress } from "./BudgetProgress";
import type { Budget } from "@/lib/supabaseQueries";

interface Props {
  budget: Budget;
  onEdit: (budget: Budget) => void;
  onDelete: (budgetId: string) => void;
}

export function BudgetCard({ budget, onEdit, onDelete }: Props) {
  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: budget.categoryColor }}
          />
          <h4 className="font-medium">{budget.categoryName}</h4>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(budget)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(budget.id)}
          >
            <Trash2 className="h-3 w-3 text-red-600" />
          </Button>
        </div>
      </div>

      {/* Progress */}
      <BudgetProgress
        budgetAmountCents={budget.budgetAmountCents}
        actualSpentCents={budget.actualSpentCents}
        percentUsed={budget.percentUsed}
        isOverBudget={budget.isOverBudget}
      />
    </Card>
  );
}
```

---

## Step 4: Create Budget Form (20 min)

Create `src/components/budgets/BudgetForm.tsx`:

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CategorySelector } from "@/components/ui/category-selector";
import { parsePHP, formatPHP } from "@/lib/currency";
import type { Budget } from "@/lib/supabaseQueries";

const MAX_AMOUNT_CENTS = 999999999;

const budgetSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  amount: z.string().min(1, "Amount is required"),
});

type BudgetFormData = z.infer<typeof budgetSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { categoryId: string; amountCents: number }) => void;
  existingBudget?: Budget;
}

export function BudgetForm({ open, onClose, onSubmit, existingBudget }: Props) {
  const form = useForm<BudgetFormData>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      categoryId: existingBudget?.categoryId || "",
      amount: existingBudget
        ? formatPHP(existingBudget.budgetAmountCents).replace("₱", "")
        : "",
    },
  });

  const handleSubmit = (data: BudgetFormData) => {
    try {
      const amountCents = parsePHP(data.amount);

      if (amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
        form.setError("amount", {
          message: "Amount must be between ₱0.01 and ₱9,999,999.99",
        });
        return;
      }

      onSubmit({
        categoryId: data.categoryId,
        amountCents,
      });

      form.reset();
      onClose();
    } catch (error) {
      form.setError("amount", {
        message: "Invalid amount format",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existingBudget ? "Edit Budget" : "Create Budget"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Category */}
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <CategorySelector
                      value={field.value}
                      onChange={field.onChange}
                      disabled={!!existingBudget}  // Can't change category when editing
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget Amount</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground">
                        ₱
                      </span>
                      <Input
                        {...field}
                        type="text"
                        placeholder="1,500.00"
                        className="pl-7"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                {existingBudget ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Step 5: Create Budget List Component (15 min)

Create `src/components/budgets/BudgetList.tsx`:

```typescript
import { formatPHP } from "@/lib/currency";
import { BudgetCard } from "./BudgetCard";
import type { BudgetGroup, Budget } from "@/lib/supabaseQueries";

interface Props {
  groups: BudgetGroup[];
  onEdit: (budget: Budget) => void;
  onDelete: (budgetId: string) => void;
}

export function BudgetList({ groups, onEdit, onDelete }: Props) {
  if (!groups || groups.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-lg font-medium text-muted-foreground">
          No budgets for this month
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Click "Add Budget" to create one
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.parentName} className="space-y-3">
          {/* Parent Category Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: group.parentColor }}
              />
              <h3 className="font-semibold text-lg">{group.parentName}</h3>
            </div>
            <div className="text-sm text-muted-foreground">
              {formatPHP(group.totalSpentCents)} of {formatPHP(group.totalBudgetCents)}
            </div>
          </div>

          {/* Budget Cards */}
          <div className="grid gap-3 md:grid-cols-2">
            {group.budgets.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Step 6: Create Budgets Page (30 min)

Create `src/routes/budgets/index.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { startOfMonth, subMonths } from "date-fns";
import { Plus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthSelector } from "@/components/MonthSelector";
import { BudgetList } from "@/components/budgets/BudgetList";
import { BudgetForm } from "@/components/budgets/BudgetForm";
import {
  useBudgets,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
  useCopyBudgets,
  type Budget,
} from "@/lib/supabaseQueries";
import { toast } from "sonner";

export const Route = createFileRoute("/budgets/")({\n  component: BudgetsPage,
});

function BudgetsPage() {
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

  const { data: budgetGroups, isLoading } = useBudgets(selectedMonth);
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const deleteBudget = useDeleteBudget();
  const copyBudgets = useCopyBudgets();

  const handleCreate = async (data: { categoryId: string; amountCents: number }) => {
    try {
      await createBudget.mutateAsync({
        categoryId: data.categoryId,
        month: selectedMonth,
        amountCents: data.amountCents,
      });
      toast.success("Budget created");
    } catch (error: any) {
      toast.error(error.message || "Failed to create budget");
    }
  };

  const handleUpdate = async (data: { categoryId: string; amountCents: number }) => {
    if (!editingBudget) return;

    try {
      await updateBudget.mutateAsync({
        id: editingBudget.id,
        amountCents: data.amountCents,
      });
      toast.success("Budget updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update budget");
    }
  };

  const handleDelete = async (budgetId: string) => {
    if (!confirm("Are you sure you want to delete this budget?")) return;

    try {
      await deleteBudget.mutateAsync(budgetId);
      toast.success("Budget deleted");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete budget");
    }
  };

  const handleCopyPrevious = async () => {
    const previousMonth = subMonths(selectedMonth, 1);

    try {
      const count = await copyBudgets.mutateAsync({
        fromMonth: previousMonth,
        toMonth: selectedMonth,
      });
      toast.success(`Copied ${count} budgets from previous month`);
    } catch (error: any) {
      toast.error(error.message || "Failed to copy budgets");
    }
  };

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingBudget(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const hasBudgets = budgetGroups && budgetGroups.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold">Budgets</h1>
              <p className="text-sm text-muted-foreground">
                Set and track monthly spending goals
              </p>
            </div>
            <MonthSelector
              selectedMonth={selectedMonth}
              onChange={setSelectedMonth}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Budget
            </Button>
            <Button
              variant="outline"
              onClick={handleCopyPrevious}
              disabled={hasBudgets}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Previous Month
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        <BudgetList
          groups={budgetGroups || []}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </main>

      {/* Form Dialog */}
      <BudgetForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={editingBudget ? handleUpdate : handleCreate}
        existingBudget={editingBudget || undefined}
      />
    </div>
  );
}
```

---

## Done!

When budgets display correctly with progress tracking and all CRUD operations work, you're ready for the checkpoint.

**Next**: Run through `CHECKPOINT.md` to verify everything works.

---

## Notes

**CRITICAL**: Budget vs actual queries MUST exclude transfers (`WHERE transfer_group_id IS NULL`). Only real expenses should count toward budget.

**Unique Constraint**: Database enforces unique (category_id, month) per household. Attempting to create duplicate budgets will fail - handle this gracefully in UI.

**No Rollover**: Budgets are independent per month. Copying previous month is a convenience feature but each month stands alone (Decision #79).

**Only Child Categories**: Only child categories should have budgets. Parent categories are for grouping only.
