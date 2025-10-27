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
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: budget.categoryColor }} />
          <h4 className="font-medium">{budget.categoryName}</h4>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(budget)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(budget.id)}>
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
