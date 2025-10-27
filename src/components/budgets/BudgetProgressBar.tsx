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

  // Color mappings for status badges
  const statusColors = {
    under: "text-green-600 bg-green-100 dark:bg-green-900/20 dark:text-green-400",
    near: "text-amber-600 bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400",
    over: "text-red-600 bg-red-100 dark:bg-red-900/20 dark:text-red-400",
  };

  // Progress bar indicator colors
  const progressColors = {
    under: "bg-green-600 dark:bg-green-500",
    near: "bg-amber-500 dark:bg-amber-400",
    over: "bg-red-600 dark:bg-red-500",
  };

  // Text colors for remaining amount
  const remainingColors = {
    under: "text-green-600 dark:text-green-400",
    near: "text-amber-600 dark:text-amber-400",
    over: "text-red-600 dark:text-red-400",
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
