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
        <p className="text-lg font-medium text-muted-foreground">No budgets for this month</p>
        <p className="text-sm text-muted-foreground mt-2">
          Click &quot;Add Budget&quot; to create one
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
              <BudgetCard key={budget.id} budget={budget} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
