/**
 * Budget Progress Card Component
 *
 * Visual progress indicator comparing budgeted amount vs actual spending.
 * Features:
 * - Color-coded progress bar (green/yellow/red)
 * - Percentage completion
 * - Amount remaining/overspent
 * - Category icon and name
 * - Click-through to view transactions
 *
 * Color thresholds:
 * - Green: 0-70% of budget
 * - Yellow: 70-100% of budget
 * - Red: Over 100% of budget
 *
 * @example
 * <BudgetProgressCard
 *   categoryName="Groceries"
 *   budgetAmount={50000} // ₱500.00
 *   actualAmount={35000} // ₱350.00
 *   onViewTransactions={() => filterByCategory('groceries')}
 * />
 */

import { ArrowRight, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface BudgetProgressCardProps {
  categoryName: string;
  categoryId?: string;
  categoryColor?: string;
  budgetAmount: number; // In cents
  actualAmount: number; // In cents
  period?: string; // e.g., "January 2024"
  onViewTransactions?: (categoryId?: string) => void;
  className?: string;
}

export function BudgetProgressCard({
  categoryName,
  categoryId,
  categoryColor = "#3b82f6",
  budgetAmount,
  actualAmount,
  period,
  onViewTransactions,
  className,
}: BudgetProgressCardProps) {
  // Calculate percentage
  const percentage = budgetAmount > 0 ? (actualAmount / budgetAmount) * 100 : 0;
  const remaining = budgetAmount - actualAmount;
  const isOverBudget = actualAmount > budgetAmount;

  // Determine status and color
  const getStatus = () => {
    if (percentage >= 100)
      return { label: "Over Budget", color: "red", variant: "destructive" as const };
    if (percentage >= 70)
      return { label: "Warning", color: "yellow", variant: "secondary" as const };
    return { label: "On Track", color: "green", variant: "default" as const };
  };

  const status = getStatus();

  // Progress bar color classes
  const getProgressColor = () => {
    if (percentage >= 100) return "bg-red-600";
    if (percentage >= 70) return "bg-yellow-500";
    return "bg-green-600";
  };

  return (
    <Card className={cn("hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold"
              style={{ backgroundColor: categoryColor }}
            >
              {categoryName.charAt(0).toUpperCase()}
            </div>
            <div>
              <CardTitle className="text-base">{categoryName}</CardTitle>
              {period && <p className="text-xs text-muted-foreground mt-0.5">{period}</p>}
            </div>
          </div>
          <Badge variant={status.variant} className="text-xs">
            {status.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono font-semibold">{percentage.toFixed(0)}%</span>
          </div>
          <Progress
            value={Math.min(percentage, 100)}
            className="h-2"
            indicatorClassName={getProgressColor()}
          />
        </div>

        {/* Amount Details */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Budgeted</p>
            <p className="font-mono text-sm font-semibold">{formatPHP(budgetAmount)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Spent</p>
            <p
              className={cn(
                "font-mono text-sm font-semibold",
                isOverBudget ? "text-red-600 dark:text-red-400" : "text-foreground"
              )}
            >
              {formatPHP(actualAmount)}
            </p>
          </div>
        </div>

        {/* Remaining/Over Amount */}
        <div
          className={cn(
            "flex items-center gap-2 p-3 rounded-lg",
            isOverBudget
              ? "bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-300"
              : "bg-green-50 dark:bg-green-950/20 text-green-900 dark:text-green-300"
          )}
        >
          {isOverBudget ? (
            <>
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Over by</p>
                <p className="font-mono text-sm font-semibold">{formatPHP(Math.abs(remaining))}</p>
              </div>
              <TrendingUp className="h-5 w-5 flex-shrink-0" />
            </>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Remaining</p>
                <p className="font-mono text-sm font-semibold">{formatPHP(remaining)}</p>
              </div>
              <TrendingDown className="h-5 w-5 flex-shrink-0" />
            </>
          )}
        </div>

        {/* View Transactions Button */}
        {onViewTransactions && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => onViewTransactions(categoryId)}
          >
            View Transactions
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
