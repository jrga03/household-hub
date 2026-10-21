import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Money } from "@/components/app/Money";
import { categoryNames } from "@/components/allocations/envelopes";
import { MoveMoneyDialog } from "@/components/allocations/MoveMoneyDialog";
import { CategoryLedger } from "@/components/categories/CategoryLedger";
import { CorrectionDialog } from "@/components/corrections/CorrectionDialog";
import { RecordName } from "@/components/categories/RecordName";
import { DetailPane, useOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { TransactionDialog } from "@/components/transactions/TransactionDialog";
import { TransferDialog } from "@/components/transactions/TransferDialog";
import { Progress } from "@/components/ui/progress";
import { useAccountNames } from "@/hooks/useAccounts";
import { useLedgerRecord, useMonthView } from "@/hooks/useBudgets";
import { useCategoryList } from "@/hooks/useCategories";
import type { LedgerRecordId } from "@/lib/budgets/ledger";
import {
  categoryMonth,
  sumMonthFigures,
  type MonthFigures,
  type MonthView,
} from "@/lib/budgets/month";
import { budgetProgress } from "@/lib/budgets/progress";
import { budgetRows } from "@/lib/budgets/rows";
import type { CategoryRow, GroupRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/lib/utils/dates";
import { useCloseWhenGone } from "@/hooks/useCloseWhenGone";

/** A group's totals are the sums of its rows, categories without a budget included. */
const groupFigures = (view: MonthView, categories: CategoryRow[]): MonthFigures =>
  sumMonthFigures(categories.map((category) => categoryMonth(view, category.id)));

/**
 * The month's budget, spent and left per category, view-only. Left is the
 * budget less what was spent, as Home's Budgets counts compare them; the
 * category's money is on Plan. `month` is "yyyy-MM"; `currentMonth` is this
 * month on this device.
 */
export function BudgetView({
  actor,
  month,
  currentMonth,
}: {
  actor: Actor;
  month: string;
  currentMonth: string;
}) {
  const list = useCategoryList();
  const accountNames = useAccountNames();
  const monthView = useMonthView(month, currentMonth);
  const { openId: ledgerId, open: openLedger } = useOpenItem();
  const [openedId, setOpenedId] = useState<LedgerRecordId | null>(null);
  const opened = useLedgerRecord(openedId);
  useCloseWhenGone(openedId, opened, () => setOpenedId(null));

  if (!list || !accountNames || !monthView) return null;
  const namesOfCategories = categoryNames(list);
  const ledgerName = ledgerId === null ? undefined : (namesOfCategories.get(ledgerId) ?? null);

  const rows = budgetRows(list, monthView);
  const empty = rows.groups.length === 0 && rows.ungrouped.length === 0;

  return (
    <>
      <PageShell.List className="space-y-4">
        {empty ? (
          <p className="text-body text-muted-foreground">
            No categories yet. Set them up on <Link to="/categories">Categories</Link>, then give
            each one a budget on the plan.
          </p>
        ) : (
          <ul aria-label="Budget by group" className="space-y-4">
            {rows.groups.map(({ group, categories }) => (
              <li key={group.id} className="rounded-md border">
                <GroupTotals group={group} figures={groupFigures(monthView, categories)} />
                <CategoryRows
                  label={`${group.name} budget`}
                  categories={categories}
                  view={monthView}
                  onOpenLedger={openLedger}
                />
              </li>
            ))}
            {rows.ungrouped.length > 0 && (
              <li className="rounded-md border">
                <p className="border-b px-3 py-2 text-body text-muted-foreground">
                  Waiting for their group to reach this device
                </p>
                <CategoryRows
                  label="Ungrouped budget"
                  categories={rows.ungrouped}
                  view={monthView}
                  onOpenLedger={openLedger}
                />
              </li>
            )}
          </ul>
        )}
      </PageShell.List>

      <DetailPane title={ledgerName} description={monthLabel(month)} item={ledgerName}>
        {(categoryName) =>
          ledgerId !== null && (
            <CategoryLedger
              key={ledgerId}
              categoryId={ledgerId}
              categoryName={categoryName}
              month={month}
              isCurrentMonth={month === currentMonth}
              names={{ accounts: accountNames, categories: namesOfCategories }}
              onOpen={({ kind, record }) => setOpenedId({ kind, id: record.id })}
            />
          )
        }
      </DetailPane>

      {opened?.kind === "transaction" && (
        <TransactionDialog
          actor={actor}
          transaction={opened.record}
          onClose={() => setOpenedId(null)}
        />
      )}
      {opened?.kind === "transfer" && (
        <TransferDialog actor={actor} transfer={opened.record} onClose={() => setOpenedId(null)} />
      )}
      {opened?.kind === "allocation" && (
        <MoveMoneyDialog
          actor={actor}
          allocation={opened.record}
          onClose={() => setOpenedId(null)}
        />
      )}
      {opened?.kind === "correction" && (
        <CorrectionDialog
          actor={actor}
          correction={opened.record}
          onClose={() => setOpenedId(null)}
        />
      )}
    </>
  );
}

function GroupTotals({ group, figures }: { group: GroupRow; figures: MonthFigures }) {
  return (
    <div className="space-y-2 border-b bg-muted/40 px-3 py-2">
      <RecordName record={group} showRetired />
      <BudgetFigures name={group.name} figures={figures} />
    </div>
  );
}

function CategoryRows({
  label,
  categories,
  view,
  onOpenLedger,
}: {
  label: string;
  categories: CategoryRow[];
  view: MonthView;
  onOpenLedger: (categoryId: string) => void;
}) {
  if (categories.length === 0) {
    return <p className="px-3 py-2 text-body text-muted-foreground">No categories in use.</p>;
  }
  return (
    <ul aria-label={label} className="divide-y">
      {categories.map((category) => (
        <li key={category.id} className="relative space-y-2 px-3 py-2 pl-6 hover:bg-muted/40">
          {/* Stretched over the row, so the whole row opens the ledger. */}
          <button
            type="button"
            aria-label={`${category.name} ledger`}
            className="flex max-w-full text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
            onClick={() => onOpenLedger(category.id)}
          >
            <RecordName record={category} showRetired />
          </button>
          <BudgetFigures
            name={category.name}
            figures={sumMonthFigures([categoryMonth(view, category.id)])}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Budget, spent and left with a bar of spent against the budget, full and red
 * once overspent. Without a budget there's nothing to compare: spent alone.
 */
function BudgetFigures({ name, figures }: { name: string; figures: MonthFigures }) {
  const progress = budgetProgress(figures.budget, figures.spent);
  return (
    <>
      {progress && (
        <Progress
          aria-label={`${name} spent`}
          value={progress.percent}
          data-overspent={progress.overspent || undefined}
          className={cn("pointer-events-none h-1.5", progress.overspent && "bg-shortfall/20")}
          indicatorClassName={progress.overspent ? "bg-shortfall" : undefined}
        />
      )}
      <dl
        aria-label={`${name} budget, spent and left`}
        className="grid grid-cols-3 gap-2 text-caption text-muted-foreground"
      >
        <div className="min-w-0">
          <dt>Budget</dt>
          <dd className="truncate tabular-nums text-foreground">
            {progress ? formatPHP(figures.budget) : "None"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt>Spent</dt>
          <dd className="truncate tabular-nums text-foreground">{formatPHP(figures.spent)}</dd>
        </div>
        {progress && (
          <div className="min-w-0 text-right">
            <dt>Left</dt>
            <dd className="truncate text-body font-medium text-foreground">
              <Money kind="balance" cents={progress.left} />
            </dd>
          </div>
        )}
      </dl>
    </>
  );
}
