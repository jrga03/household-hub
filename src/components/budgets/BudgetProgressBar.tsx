/**
 * BudgetProgressBar Component
 *
 * Visual progress indicator for budget vs actual spending.
 * Matches chunk 016 specification with enhanced color-coded status.
 *
 * Color Scheme:
 * - Green: < 80% spent (safe zone)
 * - Yellow/Amber: 80-100% spent (warning)
 * - Red: > 100% spent (over budget)
 *
 * @module BudgetProgressBar
 */

import { Progress } from "@/components/ui/progress";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface BudgetProgressBarProps {
  target: number; // Budget amount in cents
  actual: number; // Actual spending in cents
  categoryName: string;
}

/**
 * Displays a visual progress bar showing budget usage.
 *
 * This component provides at-a-glance budget health indicators:
 * - Progress bar with color-coded status
 * - Percentage badge showing % of budget used
 * - Spending amounts in PHP currency format
 * - Remaining or overspent amount
 *
 * @example
 * <BudgetProgressBar
 *   target={1000000}  // ₱10,000.00
 *   actual={750000}   // ₱7,500.00
 *   categoryName="Groceries"
 * />
 * // Shows: 75% spent, green progress bar, ₱2,500.00 remaining
 */
export function BudgetProgressBar({ target, actual, categoryName }: BudgetProgressBarProps) {
  const percentage = target > 0 ? (actual / target) * 100 : 0;
  const remaining = target - actual;

  // Determine status based on percentage
  const status = percentage < 80 ? "under" : percentage <= 100 ? "near" : "over";

  // Color mappings for status badges (semantic tokens flip with .dark, R40)
  const statusColors = {
    under: "text-income bg-income/10 dark:bg-income/15",
    near: "text-warning bg-warning/10 dark:bg-warning/15",
    over: "text-expense bg-expense/10 dark:bg-expense/15",
  };

  // Progress bar indicator colors
  const progressColors = {
    under: "bg-income",
    near: "bg-warning",
    over: "bg-expense",
  };

  // Text colors for remaining amount
  const remainingColors = {
    under: "text-income",
    near: "text-warning",
    over: "text-expense",
  };

  return (
    <div className="space-y-2">
      {/* Category Name and Percentage Badge */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{categoryName}</span>
        <span className={cn("text-xs font-semibold px-2 py-1 rounded-full", statusColors[status])}>
          {percentage.toFixed(0)}%
        </span>
      </div>

      {/* Progress Bar */}
      <Progress
        value={Math.min(percentage, 100)}
        className="h-2"
        indicatorClassName={progressColors[status]}
      />

      {/* Spending Details */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {formatPHP(actual)} of {formatPHP(target)}
        </span>
        <span className={cn("font-medium", remainingColors[status])}>
          {remaining >= 0
            ? `${formatPHP(remaining)} remaining`
            : `${formatPHP(Math.abs(remaining))} over`}
        </span>
      </div>
    </div>
  );
}
