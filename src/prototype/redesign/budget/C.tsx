// PROTOTYPE (#194): Budget C, category tiles with a pace marker for today.
import { formatPHP } from "@/lib/currency";
import { BUDGET_GROUPS, DAY_OF_MONTH, DAYS_IN_MONTH, type BudgetCategory } from "../fixtures";
import {
  BUDGETED,
  BudgetBar,
  LeftLabel,
  PACE_PERCENT,
  PhoneEditPlan,
  spentPercent,
  totalBudget,
  totalSpent,
} from "./shared";

export function BudgetC() {
  const spent = totalSpent(BUDGETED);
  const budget = totalBudget(BUDGETED);
  const overall = { budget, spent };
  const ahead = spentPercent(overall) > PACE_PERCENT;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      <PhoneEditPlan />
      <section aria-label="Spent this month" className="space-y-2">
        <p className="text-label text-muted-foreground">Spent this month</p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-figure tabular-nums">{formatPHP(spent)}</span>
          <span className="text-body text-muted-foreground">of {formatPHP(budget)}</span>
        </p>
        <BudgetBar category={overall} pace />
        <p className="text-caption text-muted-foreground">
          Day {DAY_OF_MONTH} of {DAYS_IN_MONTH}.{" "}
          {ahead ? (
            <span className="text-warning">Spending is ahead of the month.</span>
          ) : (
            "Spending is behind the month."
          )}{" "}
          The line marks today.
        </p>
      </section>

      {BUDGET_GROUPS.map((group) => (
        <section key={group.id} aria-label={group.name} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-heading">{group.name}</h2>
            <LeftLabel
              category={{ budget: totalBudget(group.categories), spent: totalSpent(group.categories) }}
              className="text-body text-muted-foreground"
            />
          </div>
          <ul className="grid grid-cols-2 gap-3 @[840px]:grid-cols-4">
            {group.categories.map((category) => (
              <Tile key={category.id} category={category} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Tile({ category }: { category: BudgetCategory }) {
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-3">
      <span className="truncate text-label text-muted-foreground">{category.name}</span>
      <LeftLabel category={category} className="truncate text-heading" />
      <span className="mt-auto space-y-2">
        <BudgetBar category={category} pace />
        <span className="block truncate text-caption text-muted-foreground tabular-nums">
          {category.budget === null
            ? "No budget"
            : `${formatPHP(category.spent)} of ${formatPHP(category.budget)}`}
        </span>
      </span>
    </li>
  );
}
