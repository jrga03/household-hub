import { diffCents, type Cents } from "@/lib/currency";

/** Where a month's spending stands against its budget. */
export type BudgetStatus = "fine" | "close" | "over";

/** A budget is close once this share of it is spent. */
const CLOSE_PERCENT = 80;

/**
 * Home's Budgets counts and Budget's rows both use this, so they agree. A budget
 * spent exactly, such as a bill paid in full, is fine.
 */
export function budgetStatus(budget: Cents, spent: Cents): BudgetStatus {
  if (spent > budget) return "over";
  // Compared without dividing cents.
  if (spent < budget && spent * 100 >= budget * CLOSE_PERCENT) return "close";
  return "fine";
}

export interface BudgetProgress {
  /** The budget less what was spent; negative once overspent. */
  left: Cents;
  /** Spent as a share of the budget, 0 to 100. */
  percent: number;
  overspent: boolean;
}

/** A Budget row's left and bar; null without a budget, which has nothing to compare against. */
export function budgetProgress(budget: Cents, spent: Cents): BudgetProgress | null {
  if (budget <= 0) return null;
  const overspent = budgetStatus(budget, spent) === "over";
  const percent = overspent ? 100 : Math.max(0, Math.round((spent / budget) * 100));
  return { left: diffCents(budget, spent), percent, overspent };
}
