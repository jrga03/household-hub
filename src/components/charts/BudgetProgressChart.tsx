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
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No budgets set for this period</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((budget) => {
        const isOverBudget = budget.percentUsed > 100;
        const isNearLimit = budget.percentUsed > 80 && budget.percentUsed <= 100;
        const progressColor = isOverBudget
          ? "bg-red-500"
          : isNearLimit
            ? "bg-yellow-500"
            : "bg-green-500";

        return (
          <Card key={budget.category}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{budget.category}</CardTitle>
                {isOverBudget && <AlertCircle className="h-4 w-4 text-red-500" />}
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
                    className={isOverBudget ? "text-red-600 font-medium" : "text-muted-foreground"}
                  >
                    {budget.percentUsed.toFixed(0)}%
                  </span>
                </div>

                {/* Variance */}
                <div className="flex items-center gap-1 text-xs">
                  {budget.variance >= 0 ? (
                    <>
                      <TrendingDown className="h-3 w-3 text-green-600" />
                      <span className="text-green-600">
                        {formatPHP(budget.variance)} under budget
                      </span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-3 w-3 text-red-600" />
                      <span className="text-red-600">
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
