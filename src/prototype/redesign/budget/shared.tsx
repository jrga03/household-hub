/* eslint-disable arch/no-direct-primitive-import -- prototype (#194), throwaway branch */
// PROTOTYPE (#194): pieces the Budget variants share.
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { absCents, diffCents, formatPHP, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  BUDGET_GROUPS,
  DAY_OF_MONTH,
  DAYS_IN_MONTH,
  MONTH_LABEL,
  type BudgetCategory,
} from "../fixtures";

export const ALL_CATEGORIES = BUDGET_GROUPS.flatMap((group) => group.categories);
export const BUDGETED = ALL_CATEGORIES.filter((category) => category.budget !== null);
export const DAYS_LEFT = DAYS_IN_MONTH - DAY_OF_MONTH;
export const PACE_PERCENT = (DAY_OF_MONTH / DAYS_IN_MONTH) * 100;

export const totalBudget = (categories: BudgetCategory[]): Cents =>
  sumCents(categories.map((category) => category.budget ?? ZERO_CENTS));
export const totalSpent = (categories: BudgetCategory[]): Cents =>
  sumCents(categories.map((category) => category.spent));
export const totalLeft = (categories: BudgetCategory[]): Cents =>
  diffCents(totalBudget(categories), totalSpent(categories));

export function spentPercent(category: Pick<BudgetCategory, "budget" | "spent">): number {
  if (!category.budget) return 0;
  return Math.min(100, (category.spent / category.budget) * 100);
}

export function MonthActions() {
  return (
    <>
      <div className="flex items-center">
        <Button variant="ghost" size="icon" aria-label="Previous month">
          <ChevronLeft />
        </Button>
        <span className="hidden text-body font-medium md:inline">{MONTH_LABEL}</span>
        <Button variant="ghost" size="icon" aria-label="Next month">
          <ChevronRight />
        </Button>
      </div>
      <Button variant="outline" size="sm" className="hidden md:inline-flex">
        <Pencil />
        Edit plan
      </Button>
    </>
  );
}

/** The phone has no header room for Edit plan, so it leads the body. */
export function PhoneEditPlan() {
  return (
    <div className="flex items-center justify-between gap-2 md:hidden">
      <span className="text-body font-medium">{MONTH_LABEL}</span>
      <Button variant="outline" size="sm">
        <Pencil />
        Edit plan
      </Button>
    </div>
  );
}

/** "₱2,519.40 left", or "₱1,230.00 over" in shortfall. Without a budget, what was spent. */
export function LeftLabel({
  category,
  className,
}: {
  category: Pick<BudgetCategory, "budget" | "spent">;
  className?: string;
}) {
  if (category.budget === null) {
    return (
      <span className={cn("whitespace-nowrap tabular-nums text-muted-foreground", className)}>
        {formatPHP(category.spent)} spent
      </span>
    );
  }
  const left = diffCents(category.budget, category.spent);
  if (left < 0) {
    return (
      <span className={cn("whitespace-nowrap tabular-nums text-shortfall", className)}>
        −{formatPHP(absCents(left))} over
      </span>
    );
  }
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>{formatPHP(left)} left</span>
  );
}

/** Spent against the budget; full and red once overspent. An optional marker shows today's pace. */
export function BudgetBar({
  category,
  pace = false,
  className,
}: {
  category: Pick<BudgetCategory, "budget" | "spent">;
  pace?: boolean;
  className?: string;
}) {
  if (category.budget === null) return null;
  const over = category.spent > category.budget;
  const close = !over && category.spent >= category.budget * 0.85;
  const ahead = pace && spentPercent(category) > PACE_PERCENT;
  return (
    <div
      role="img"
      aria-label={`${Math.round(spentPercent(category))}% of the budget spent`}
      className={cn("relative h-1.5 w-full rounded-full", over ? "bg-shortfall/20" : "bg-primary/15")}
    >
      <div
        className={cn(
          "h-full rounded-full",
          over ? "bg-shortfall" : close || ahead ? "bg-warning" : "bg-primary",
          className
        )}
        style={{ width: `${spentPercent(category)}%` }}
      />
      {pace && (
        <div
          aria-hidden
          className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground"
          style={{ left: `${PACE_PERCENT}%` }}
        />
      )}
    </div>
  );
}

const LEDGER: Record<string, { date: string; label: string; amount: number }[]> = {
  dining: [
    { date: "Oct 5", label: "Ramen Nagi", amount: -1598 },
    { date: "Oct 12", label: "Samgyupsal", amount: -2480 },
    { date: "Oct 16", label: "Mang Inasal", amount: -640 },
    { date: "Oct 19", label: "Jollibee", amount: -512 },
  ],
};

/** A few fake ledger lines with a running balance, for the selected category. */
export function LedgerPane({ category }: { category: BudgetCategory }) {
  const lines = LEDGER[category.id] ?? [
    { date: "Oct 3", label: "Spending", amount: -category.spent / 100 / 2 },
    { date: "Oct 14", label: "Spending", amount: -category.spent / 100 / 2 },
  ];
  const start = (category.budget ?? category.spent) / 100;
  const balances = lines.map((_, index) =>
    lines.slice(0, index + 1).reduce((sum, line) => sum + line.amount, start)
  );
  return (
    <section aria-label={`${category.name} ledger`} className="space-y-4">
      <div>
        <h2 className="text-heading">{category.name}</h2>
        <p className="text-body text-muted-foreground">
          {MONTH_LABEL} · <LeftLabel category={category} />
        </p>
      </div>
      <BudgetBar category={category} />
      <ol className="divide-y text-body">
        <li className="flex justify-between gap-3 py-2 text-muted-foreground">
          <span>Money at the start</span>
          <span className="tabular-nums">{formatPHP(toCents(start))}</span>
        </li>
        {lines.map((line, index) => {
          const running = balances[index] ?? start;
          return (
            <li key={line.label + line.date} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">{line.label}</span>
                <span className="block text-caption text-muted-foreground">{line.date}</span>
              </span>
              <span className="text-right tabular-nums">
                <span className="block">−{formatPHP(toCents(Math.abs(line.amount)))}</span>
                <span
                  className={cn(
                    "block text-caption text-muted-foreground",
                    running < 0 && "text-shortfall"
                  )}
                >
                  {running < 0 ? "−" : ""}
                  {formatPHP(toCents(Math.abs(running)))}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const toCents = (pesos: number) => Math.round(pesos * 100) as Cents;
