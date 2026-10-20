/* eslint-disable arch/no-direct-primitive-import -- prototype (#194), throwaway branch */
// PROTOTYPE (#194): Budget B, categories sorted by status; a board on the laptop.
import { Badge } from "@/components/ui/badge";
import { formatPHP } from "@/lib/currency";
import { BUDGET_GROUPS, budgetStatus, type BudgetCategory, type BudgetStatus } from "../fixtures";
import { BudgetBar, DAYS_LEFT, LeftLabel, PhoneEditPlan, BUDGETED, totalBudget, totalLeft } from "./shared";

const STATUSES: {
  status: BudgetStatus;
  title: string;
  badge: "outline" | "warning" | "secondary";
  badgeClass?: string;
}[] = [
  { status: "over", title: "Over", badge: "outline", badgeClass: "border-shortfall/50 text-shortfall" },
  { status: "close", title: "Close", badge: "warning" },
  { status: "fine", title: "On track", badge: "secondary" },
  { status: "none", title: "No budget", badge: "outline" },
];

const withGroup = BUDGET_GROUPS.flatMap((group) =>
  group.categories.map((category) => ({ ...category, group: group.name }))
);

export function BudgetB() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      <PhoneEditPlan />
      <section aria-label="Left to spend" className="space-y-2">
        <p className="text-label text-muted-foreground">Left to spend</p>
        <p className="text-figure tabular-nums">{formatPHP(totalLeft(BUDGETED))}</p>
        <p className="text-body text-muted-foreground">
          of {formatPHP(totalBudget(BUDGETED))} budget · {DAYS_LEFT} days left
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {STATUSES.map(({ status, title, badge, badgeClass }) => (
            <Badge key={status} variant={badge} className={badgeClass}>
              {withGroup.filter((category) => budgetStatus(category) === status).length} {title.toLowerCase()}
            </Badge>
          ))}
        </div>
      </section>

      <div className="grid gap-8 @[840px]:grid-cols-4 @[840px]:items-start @[840px]:gap-4">
        {STATUSES.map(({ status, title, badge, badgeClass }) => {
          const categories = withGroup.filter((category) => budgetStatus(category) === status);
          return (
            <section
              key={status}
              aria-label={title}
              className="min-w-0 space-y-2 @[840px]:rounded-lg @[840px]:bg-card @[840px]:p-3 @[840px]:ring-1 @[840px]:ring-border"
            >
              <div className="flex items-center gap-2 border-b pb-2 @[840px]:border-none @[840px]:pb-0">
                <h2 className="text-heading">{title}</h2>
                <Badge variant={badge} className={badgeClass}>
                  {categories.length}
                </Badge>
              </div>
              {categories.length === 0 ? (
                <p className="py-2 text-body text-muted-foreground">Nothing here this month.</p>
              ) : (
                <ul className="divide-y @[840px]:space-y-2 @[840px]:divide-y-0">
                  {categories.map((category) => (
                    <Row key={category.id} category={category} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Row({ category }: { category: BudgetCategory & { group: string } }) {
  return (
    <li className="space-y-2 py-3 @[840px]:rounded-md @[840px]:bg-background @[840px]:p-3 @[840px]:ring-1 @[840px]:ring-border">
      <div className="flex items-baseline justify-between gap-3 text-body @[840px]:flex-col @[840px]:gap-0">
        <span className="min-w-0">
          <span className="block truncate font-medium">{category.name}</span>
          <span className="block text-caption text-muted-foreground">{category.group}</span>
        </span>
        <LeftLabel category={category} className="text-right @[840px]:pt-1 @[840px]:text-left" />
      </div>
      <BudgetBar category={category} />
    </li>
  );
}
