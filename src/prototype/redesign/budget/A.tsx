// PROTOTYPE (#194): Budget A, grouped rows with a ledger pane on the laptop.
import { useState } from "react";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { BUDGET_GROUPS, type BudgetCategory } from "../fixtures";
import {
  ALL_CATEGORIES,
  BUDGETED,
  BudgetBar,
  DAYS_LEFT,
  LedgerPane,
  LeftLabel,
  PhoneEditPlan,
  totalBudget,
  totalLeft,
  totalSpent,
} from "./shared";

export function BudgetA() {
  const [selectedId, setSelectedId] = useState("dining");
  const selected = ALL_CATEGORIES.find((category) => category.id === selectedId);
  const overall = { budget: totalBudget(BUDGETED), spent: totalSpent(BUDGETED) };

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 @[840px]:grid-cols-[1fr_320px] @[840px]:items-start">
      <div className="min-w-0 space-y-8">
        <PhoneEditPlan />
        <section aria-label="Left to spend" className="space-y-2">
          <p className="text-label text-muted-foreground">Left to spend</p>
          <p className="text-figure tabular-nums">{formatPHP(totalLeft(BUDGETED))}</p>
          <p className="text-body text-muted-foreground">
            of {formatPHP(overall.budget)} budget · {DAYS_LEFT} days left
          </p>
          <BudgetBar category={overall} />
        </section>

        {BUDGET_GROUPS.map((group) => (
          <section key={group.id} aria-label={group.name} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 border-b pb-2">
              <h2 className="text-heading">{group.name}</h2>
              <LeftLabel
                category={{
                  budget: totalBudget(group.categories),
                  spent: totalSpent(group.categories),
                }}
                className="text-body font-medium"
              />
            </div>
            <div className="hidden grid-cols-[1fr_7rem_7rem_9rem] gap-3 px-2 pt-2 text-caption text-muted-foreground @[600px]:grid">
              <span>Category</span>
              <span className="text-right">Budget</span>
              <span className="text-right">Spent</span>
              <span className="text-right">Left</span>
            </div>
            <ul className="divide-y">
              {group.categories.map((category) => (
                <Row
                  key={category.id}
                  category={category}
                  selected={category.id === selectedId}
                  onSelect={() => setSelectedId(category.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <aside className="sticky top-16 hidden rounded-lg border bg-card p-4 @[840px]:block">
        {selected && <LedgerPane category={selected} />}
      </aside>
    </div>
  );
}

function Row({
  category,
  selected,
  onSelect,
}: {
  category: BudgetCategory;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected || undefined}
        className={cn(
          "grid w-full gap-2 rounded-md px-2 py-3 text-left text-body transition-colors hover:bg-accent @[600px]:grid-cols-[1fr_7rem_7rem_9rem] @[600px]:items-center @[600px]:gap-3",
          selected && "@[840px]:bg-accent"
        )}
      >
        <span className="flex items-baseline justify-between gap-3 @[600px]:contents">
          <span className="min-w-0 truncate font-medium">{category.name}</span>
          <span className="hidden text-right tabular-nums text-muted-foreground @[600px]:block">
            {category.budget === null ? "None" : formatPHP(category.budget)}
          </span>
          <span className="hidden text-right tabular-nums text-muted-foreground @[600px]:block">
            {formatPHP(category.spent)}
          </span>
          <LeftLabel category={category} className="text-right" />
        </span>
        <span className="@[600px]:col-span-4">
          <BudgetBar category={category} />
        </span>
      </button>
    </li>
  );
}
