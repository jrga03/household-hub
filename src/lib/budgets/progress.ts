import type { MonthFigures } from "./month";

export interface BudgetProgress {
  /** How much of the month's money is spent, 0 to 100. */
  percent: number;
  /** The category spent more than it held, so what's left is negative. */
  overspent: boolean;
}

/**
 * A Budget row's bar: spent against what the month had to spend, which is
 * what was spent plus what's left. Overspending fills the bar.
 */
export function budgetProgress({
  spent,
  money,
}: Pick<MonthFigures, "spent" | "money">): BudgetProgress {
  if (money < 0) return { percent: 100, overspent: true };
  const available = spent + money;
  if (spent <= 0 || available <= 0) return { percent: 0, overspent: false };
  return { percent: Math.min(100, Math.round((spent / available) * 100)), overspent: false };
}
