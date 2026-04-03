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

export const Route = createFileRoute("/budgets/")({
  component: BudgetsPage,
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create budget";
      toast.error(message);
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update budget";
      toast.error(message);
    }
  };

  const handleDelete = async (budgetId: string) => {
    // TODO: Replace with proper dialog component (see linting errors)
    if (!window.confirm("Are you sure you want to delete this budget?")) return;

    try {
      await deleteBudget.mutateAsync(budgetId);
      toast.success("Budget deleted");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete budget";
      toast.error(message);
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to copy budgets";
      toast.error(message);
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
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-xl font-bold">Budgets</h1>
              <p className="text-sm text-muted-foreground">Set and track monthly spending goals</p>
            </div>
            <MonthSelector selectedMonth={selectedMonth} onChange={setSelectedMonth} />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Budget
            </Button>
            <Button variant="outline" onClick={handleCopyPrevious}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Previous Month
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto max-w-7xl px-4 py-8">
        <BudgetList groups={budgetGroups || []} onEdit={handleEdit} onDelete={handleDelete} />
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
