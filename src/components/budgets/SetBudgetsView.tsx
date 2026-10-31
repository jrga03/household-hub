import { useState } from "react";
import { format } from "date-fns";
import { SlidersHorizontal } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/app/Button";
import { CurrencyInput } from "@/components/app/CurrencyInput";
import { EmptyState } from "@/components/app/EmptyState";
import { advanceOnEnter } from "@/components/app/FormSheet";
import { Money } from "@/components/app/Money";
import { RecordName } from "@/components/categories/RecordName";
import { PageShell } from "@/components/layout/PageShell";
import { useAccounts } from "@/hooks/useAccounts";
import { useMonthView } from "@/hooks/useBudgets";
import { useCategoryList } from "@/hooks/useCategories";
import { useCloseWhenGone } from "@/hooks/useCloseWhenGone";
import type { AccountRow } from "@/lib/accounts/projection";
import type { Budget } from "@/lib/budgets/inForce";
import { categoryMonth, sumMonthFigures, type MonthView } from "@/lib/budgets/month";
import { planChange } from "@/lib/budgets/plan";
import { canFundBudget } from "@/lib/budgets/projection";
import { categoriesInUse, type CategoryRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { setBudget } from "@/lib/commands/budgets";
import { ZERO_CENTS } from "@/lib/currency";
import { errorMessage } from "@/lib/utils";
import { parseLocalDate, shiftMonth } from "@/lib/utils/dates";
import { CollapsibleGroup, UNGROUPED } from "./CollapsibleGroup";
import { useCollapsedGroupsStore } from "@/stores/collapsedGroupsStore";
import { SetBudgetDialog } from "./SetBudgetDialog";

const shortMonth = (month: string) => format(parseLocalDate(`${month}-01`), "MMM");

/** Where each category's budget for the month is typed. `month` is "yyyy-MM". */
export function SetBudgetsView({
  actor,
  month,
  currentMonth,
}: {
  actor: Actor;
  month: string;
  currentMonth: string;
}) {
  const list = useCategoryList();
  const accounts = useAccounts();
  const thisMonth = useMonthView(month, currentMonth);
  const lastMonth = useMonthView(shiftMonth(month, -1), currentMonth);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const inUse = list && categoriesInUse(list);
  const details = inUse?.find((category) => category.id === detailsId);
  useCloseWhenGone(detailsId, inUse && (details ?? null), () => setDetailsId(null));
  const collapsedGroupIds = useCollapsedGroupsStore((state) => state.collapsedGroupIds);

  if (!list || !inUse || !accounts || !thisMonth || !lastMonth) return null;
  const shownGroups = list.groups.filter((group) => !collapsedGroupIds.includes(group.id));
  const shownUngrouped = collapsedGroupIds.includes(UNGROUPED) ? [] : list.ungrouped;
  const lastId = [...shownGroups.flatMap((group) => group.categories), ...shownUngrouped].at(
    -1
  )?.id;

  const rows = (categories: CategoryRow[]) =>
    categories.length === 0 ? (
      <li>
        <EmptyState className="px-4 py-2">No categories in use.</EmptyState>
      </li>
    ) : (
      categories.map((category) => (
        <BudgetAmountRow
          key={category.id}
          actor={actor}
          category={category}
          month={month}
          spent={{ last: lastMonth, this: thisMonth }}
          budget={categoryMonth(thisMonth, category.id).budget}
          fundingChoices={accounts.filter((account) => canFundBudget(account, category))}
          isLast={category.id === lastId}
          onDetails={() => setDetailsId(category.id)}
        />
      ))
    );
  const budgeted = (categories: CategoryRow[]) => (
    <span className="text-body text-muted-foreground">
      <Money
        kind="balance"
        cents={
          sumMonthFigures(categories.map((category) => categoryMonth(thisMonth, category.id)))
            .budget
        }
      />{" "}
      budgeted
    </span>
  );

  return (
    <PageShell.Main className="space-y-8">
      {inUse.length === 0 ? (
        <EmptyState>
          No categories yet. Set them up on <Link to="/categories">Categories</Link> first.
        </EmptyState>
      ) : (
        // Each amount saves as you leave it; Enter moves on, or saves the last one.
        <form
          ref={advanceOnEnter}
          aria-label="Set budgets"
          className="space-y-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          }}
        >
          {list.groups.map((group) => (
            <CollapsibleGroup
              key={group.id}
              groupId={group.id}
              label={group.name}
              title={<RecordName record={group} showRetired />}
              action={budgeted(group.categories)}
            >
              <ul aria-label={`${group.name} budgets`} className="divide-y border-y">
                {rows(group.categories)}
              </ul>
            </CollapsibleGroup>
          ))}
          {list.ungrouped.length > 0 && (
            <CollapsibleGroup
              groupId={UNGROUPED}
              label="Ungrouped"
              title="Waiting for their group to reach this device"
              action={budgeted(list.ungrouped)}
            >
              <ul aria-label="Ungrouped budgets" className="divide-y border-y">
                {rows(list.ungrouped)}
              </ul>
            </CollapsibleGroup>
          )}
        </form>
      )}

      {details && (
        <SetBudgetDialog
          actor={actor}
          category={details}
          month={month}
          onClose={() => setDetailsId(null)}
        />
      )}
    </PageShell.Main>
  );
}

/** A category's budget for the month, typed in place, with what it spent and the money it holds as hints. */
function BudgetAmountRow({
  actor,
  category,
  month,
  spent,
  budget,
  fundingChoices,
  isLast,
  onDetails,
}: {
  actor: Actor;
  category: CategoryRow;
  month: string;
  spent: { last: MonthView; this: MonthView };
  budget: Budget | null;
  fundingChoices: AccountRow[];
  isLast: boolean;
  onDetails: () => void;
}) {
  const inputId = `budget-${category.id}`;
  const hintId = `${inputId}-hint`;
  const moneyId = `${inputId}-money`;
  const spentIn = (view: MonthView) => (
    <Money kind="balance" cents={categoryMonth(view, category.id).spent} />
  );

  // The typed text, read before the field reformats it, so a typo reaches planChange's message.
  const save = async (text: string) => {
    const change = planChange(text, budget, fundingChoices);
    if (change.kind === "problem") {
      toast.error(`${category.name}: ${change.message}`);
      return;
    }
    if (change.kind === "unchanged") return;
    try {
      await setBudget(actor, { categoryId: category.id, fromMonth: month, ...change });
    } catch (caught) {
      toast.error(errorMessage(caught, `Couldn't set the budget for ${category.name}.`));
    }
  };

  return (
    <li className="flex items-center gap-2 py-2 pr-2 pl-4">
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="flex min-w-0">
          <RecordName record={category} />
        </label>
        <p id={hintId} className="truncate text-caption text-muted-foreground">
          Spent {shortMonth(shiftMonth(month, -1))} {spentIn(spent.last)} · {shortMonth(month)}{" "}
          {spentIn(spent.this)}
        </p>
        <p id={moneyId} className="truncate text-caption text-muted-foreground">
          Holds <Money kind="balance" cents={categoryMonth(spent.this, category.id).money} />
        </p>
      </div>
      <CurrencyInput
        id={inputId}
        className="w-32 shrink-0 text-right"
        autoComplete="off"
        placeholder="0.00"
        enterKeyHint={isLast ? "done" : "next"}
        aria-describedby={`${hintId} ${moneyId}`}
        value={budget?.amountCents ?? ZERO_CENTS}
        onBlur={(event) => void save(event.target.value)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${category.name} budget details`}
        onClick={onDetails}
      >
        <SlidersHorizontal />
      </Button>
    </li>
  );
}
