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
        className="h-3"
        indicatorClassName={getProgressColor()}
      />

      {/* Stats */}
      <div className="flex items-center justify-between text-sm">
        <div className={cn("font-medium", getTextColor())}>{formatPHP(actualSpentCents)} spent</div>
        <div className="text-muted-foreground">of {formatPHP(budgetAmountCents)}</div>
      </div>

      {/* Percentage or Over Budget Warning */}
      {isOverBudget ? (
        <div className="text-xs text-red-600 font-medium">
          ⚠️ Over budget by {formatPHP(actualSpentCents - budgetAmountCents)}
        </div>
      ) : (
        <div className={cn("text-xs", getTextColor())}>
          {percentUsed.toFixed(1)}% used • {formatPHP(budgetAmountCents - actualSpentCents)}{" "}
          remaining
        </div>
      )}
    </div>
  );
}
