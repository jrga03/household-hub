/**
 * Budget vs Actual Calculation Hook
 *
 * Provides budget comparison data showing target vs actual spending per category.
 * This is a specialized wrapper around useBudgets that extracts the actual spending
 * calculations for use in budget progress components.
 *
 * CRITICAL: Actual spending ALWAYS excludes transfers to prevent double-counting.
 * Transfers are movements between accounts, not actual expenses.
 *
 * @module useBudgetActuals
 */

import { useBudgets, type Budget } from "@/lib/supabaseQueries";
import { useMemo } from "react";

/**
 * Individual budget comparison with calculated metrics
 */
export interface BudgetComparison {
  categoryId: string;
  categoryName: string;
  target: number; // Budget amount in cents
  actual: number; // Actual spending in cents (transfers excluded)
  remaining: number; // target - actual (can be negative if over budget)
  percentage: number; // (actual / target) * 100
  status: "under" | "near" | "over"; // <80%, 80-100%, >100%
}

/**
 * Fetches budget vs actual spending comparison for a specific month.
 *
 * This hook transforms the BudgetGroup data structure into a flat array
 * of BudgetComparison objects, making it easier to render progress bars
 * and summary statistics.
 *
 * **Transfer Exclusion**: The underlying useBudgets hook already excludes
 * transfers from actual spending calculations (see supabaseQueries.ts line 1163).
 *
 * @param householdId - Household ID (kept for API compatibility but unused - RLS handles filtering)
 * @param month - The month as a Date object (will be converted to YYYY-MM-DD format)
 * @returns Array of budget comparisons with calculated metrics
 *
 * @example
 * const { data: comparisons, isLoading } = useBudgetActuals(
 *   "household-123",
 *   new Date(2024, 0, 1) // January 2024
 * );
 *
 * comparisons?.forEach(comp => {
 *   console.log(`${comp.categoryName}: ${comp.percentage}% used`);
 *   if (comp.status === "over") {
 *     console.warn(`Over budget by ${formatPHP(Math.abs(comp.remaining))}`);
 *   }
 * });
 */
export function useBudgetActuals(_householdId: string, month: Date) {
  // householdId parameter kept for chunk 016 API compatibility
  // RLS policies automatically filter budgets by authenticated user's household

  // Fetch budget groups (includes actual spending calculations)
  const budgetsQuery = useBudgets(month);

  // Transform BudgetGroup[] to BudgetComparison[]
  const comparisons = useMemo(() => {
    if (!budgetsQuery.data) return [];

    const result: BudgetComparison[] = [];

    // Flatten budget groups into individual comparisons
    budgetsQuery.data.forEach((group) => {
      group.budgets.forEach((budget: Budget) => {
        // Defensive check for required fields
        if (!budget.categoryName || !budget.categoryId) {
          console.warn(`Skipping malformed budget: ${budget.id}`);
          return;
        }

        result.push({
          categoryId: budget.categoryId,
          categoryName: budget.categoryName,
          target: budget.budgetAmountCents,
          actual: budget.actualSpentCents,
          remaining: budget.remainingCents,
          percentage: budget.percentUsed,
          status: budget.isOverBudget ? "over" : budget.percentUsed >= 80 ? "near" : "under",
        });
      });
    });

    return result;
  }, [budgetsQuery.data]);

  return {
    ...budgetsQuery,
    data: comparisons,
  };
}

/**
 * Helper function to calculate total budget metrics across all categories
 *
 * @param comparisons - Array of budget comparisons
 * @returns Aggregate budget metrics
 */
export function calculateBudgetTotals(comparisons: BudgetComparison[]) {
  const totalTarget = comparisons.reduce((sum, c) => sum + c.target, 0);
  const totalActual = comparisons.reduce((sum, c) => sum + c.actual, 0);
  const totalRemaining = totalTarget - totalActual;
  const overallPercentage = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;

  return {
    totalTarget,
    totalActual,
    totalRemaining,
    overallPercentage,
    categoriesOverBudget: comparisons.filter((c) => c.status === "over").length,
    categoriesNearBudget: comparisons.filter((c) => c.status === "near").length,
    categoriesUnderBudget: comparisons.filter((c) => c.status === "under").length,
  };
}
