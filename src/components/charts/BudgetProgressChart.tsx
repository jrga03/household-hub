import { formatPHP } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingDown, TrendingUp, AlertCircle } from "lucide-react";

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
      <div>
        <h3 className="text-lg font-semibold mb-4">Budget Progress</h3>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No budgets set for this period</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Budget Progress</h3>
      {data.map((budget) => {
        const isOverBudget = budget.percentUsed > 100;
        const isNearLimit = budget.percentUsed > 80 && budget.percentUsed <= 100;
        const progressColor = isOverBudget
          ? "bg-expense"
          : isNearLimit
            ? "bg-warning"
            : "bg-income";

        return (
          <Card key={budget.category}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{budget.category}</CardTitle>
                {isOverBudget && <AlertCircle className="h-4 w-4 text-expense" />}
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
                  <span
                    className={isOverBudget ? "text-expense font-medium" : "text-muted-foreground"}
                  >
                    {budget.percentUsed.toFixed(0)}%
                  </span>
                </div>

                {/* Variance */}
                <div className="flex items-center gap-1 text-xs">
                  {budget.variance >= 0 ? (
                    <>
                      <TrendingDown className="h-3 w-3 text-income" />
                      <span className="text-income">{formatPHP(budget.variance)} under budget</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-3 w-3 text-expense" />
                      <span className="text-expense">
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
