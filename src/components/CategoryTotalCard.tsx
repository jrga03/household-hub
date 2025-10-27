import { formatPHP } from "@/lib/currency";
import { sanitizeHexColor } from "@/lib/validateColor";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";

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
  // Improved division-by-zero handling
  const change =
    previousExpenseCents !== undefined && previousExpenseCents > 0
      ? ((category.expenseCents - previousExpenseCents) / previousExpenseCents) * 100
      : null;

  const hasIncrease = change !== null && change > 0;
  const hasChange = change !== null && Math.abs(change) > 0.01;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: sanitizeHexColor(category.color) }}
          />
          <h4 className="font-medium">{category.categoryName}</h4>
        </div>
        <div className="text-right">
          <div className="font-mono font-semibold text-lg">{formatPHP(category.expenseCents)}</div>
          <div className="text-xs text-muted-foreground">
            {category.transactionCount} transactions
          </div>
        </div>
      </div>

      {/* Custom progress bar with category color */}
      <div className="mb-2">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full transition-all duration-300 ease-in-out"
            style={{
              width: `${Math.min(category.percentOfTotal, 100)}%`,
              backgroundColor: sanitizeHexColor(category.color),
            }}
          />
        </div>
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
