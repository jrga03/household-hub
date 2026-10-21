import { useState, type ComponentProps, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/app/EmptyState";
import { HeroFigure } from "@/components/app/HeroFigure";
import { RowTargetElement } from "@/components/app/ListRow";
import { Money } from "@/components/app/Money";
import { ProgressBar } from "@/components/app/ProgressBar";
import { SectionHeader } from "@/components/app/SectionHeader";
import { StatusBadge, type StatusTone } from "@/components/app/StatusBadge";
import { categoryNames } from "@/components/allocations/envelopes";
import { MoveMoneyDialog } from "@/components/allocations/MoveMoneyDialog";
import { CategoryLedger } from "@/components/categories/CategoryLedger";
import { CorrectionDialog } from "@/components/corrections/CorrectionDialog";
import { RecordName } from "@/components/categories/RecordName";
import { DetailPane, resolveOpenItem, useOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { TransactionDialog } from "@/components/transactions/TransactionDialog";
import { TransferDialog } from "@/components/transactions/TransferDialog";
import { useAccountNames } from "@/hooks/useAccounts";
import { useLedgerRecord, useMonthView } from "@/hooks/useBudgets";
import { useCategoryList } from "@/hooks/useCategories";
import { useCloseWhenGone } from "@/hooks/useCloseWhenGone";
import type { LedgerRecordId } from "@/lib/budgets/ledger";
import {
  categoryMonth,
  sumMonthFigures,
  type MonthFigures,
  type MonthView,
} from "@/lib/budgets/month";
import { budgetProgress, budgetStatus, type BudgetStatus } from "@/lib/budgets/progress";
import { budgetRows } from "@/lib/budgets/rows";
import type { CategoryRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { cn, countOf } from "@/lib/utils";
import { monthLabel } from "@/lib/utils/dates";

const BAR_TONE: Record<BudgetStatus, ComponentProps<typeof ProgressBar>["tone"]> = {
  fine: "primary",
  close: "warning",
  over: "shortfall",
};

const STATUS_BADGE: Record<BudgetStatus, { tone: StatusTone; text: string } | null> = {
  fine: null,
  close: { tone: "warning", text: "Close" },
  over: { tone: "shortfall", text: "Over budget" },
};

/** Category, Budget, Spent and Left, from a list width of 600. */
const COLUMNS = "@[600px]:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem] @[600px]:gap-x-3";

const figuresOf = (view: MonthView, categories: CategoryRow[]): MonthFigures =>
  sumMonthFigures(categories.map((category) => categoryMonth(view, category.id)));

/**
 * The month's budget, spent and left per category, view-only. Left is the
 * budget less what was spent, as Home's Budgets counts compare them; the
 * category's money is on Plan. `month` is "yyyy-MM"; `currentMonth` is this
 * month on this device; `daysLeft` is given for this month only.
 */
export function BudgetView({
  actor,
  month,
  currentMonth,
  daysLeft,
}: {
  actor: Actor;
  month: string;
  currentMonth: string;
  daysLeft?: number;
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
  const ledger = resolveOpenItem(ledgerId, (id) => {
    const name = namesOfCategories.get(id);
    return name === undefined ? undefined : { id, name };
  });

  const rows = budgetRows(list, monthView);
  const empty = rows.groups.length === 0 && rows.ungrouped.length === 0;
  const allCategories = [...rows.groups.flatMap(({ categories }) => categories), ...rows.ungrouped];
  const rowProps = { view: monthView, openId: ledgerId, onOpen: openLedger };

  return (
    <>
      <PageShell.List className="@container space-y-8">
        {empty ? (
          <EmptyState
            action={
              <Link
                to="/categories"
                className="text-body font-medium text-primary underline-offset-4 hover:underline"
              >
                Set up categories
              </Link>
            }
          >
            No categories yet. Set them up, then give each one a budget on the plan.
          </EmptyState>
        ) : (
          <>
            <Overall figures={figuresOf(monthView, allCategories)} daysLeft={daysLeft} />
            {rows.groups.map(({ group, categories }) => (
              <section key={group.id} aria-label={group.name} className="space-y-2">
                <SectionHeader
                  title={<RecordName record={group} showRetired />}
                  action={<LeftFigure figures={figuresOf(monthView, categories)} />}
                />
                {categories.length === 0 ? (
                  <EmptyState className="py-2">No categories in use.</EmptyState>
                ) : (
                  <CategoryRows
                    label={`${group.name} budget`}
                    categories={categories}
                    {...rowProps}
                  />
                )}
              </section>
            ))}
            {rows.ungrouped.length > 0 && (
              <section aria-label="Ungrouped" className="space-y-2">
                <SectionHeader title="Ungrouped" />
                <p className="text-body text-muted-foreground">
                  Waiting for their group to reach this device
                </p>
                <CategoryRows label="Ungrouped budget" categories={rows.ungrouped} {...rowProps} />
              </section>
            )}
          </>
        )}
      </PageShell.List>

      <DetailPane title={ledger?.name} description={monthLabel(month)} item={ledger}>
        {({ id, name }) => (
          <CategoryLedger
            key={id}
            categoryId={id}
            categoryName={name}
            month={month}
            isCurrentMonth={month === currentMonth}
            names={{ accounts: accountNames, categories: namesOfCategories }}
            onOpen={({ kind, record }) => setOpenedId({ kind, id: record.id })}
          />
        )}
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

/** The month across every category: what's left of the budgets, with one bar. */
function Overall({ figures, daysLeft }: { figures: MonthFigures; daysLeft?: number }) {
  const progress = budgetProgress(figures.budget, figures.spent);
  if (!progress) return null;
  return (
    <div className="space-y-3">
      <HeroFigure
        label="Left to spend"
        value={<Money kind="balance" cents={progress.left} />}
        caption={
          <>
            of <Money kind="balance" cents={figures.budget} /> budget
            {daysLeft !== undefined && (
              <>
                {" · "}
                <span data-testid="days-left">{countOf(daysLeft, "day", "days")} left</span>
              </>
            )}
          </>
        }
      />
      <ProgressBar
        label="All budgets spent"
        value={progress.percent}
        tone={BAR_TONE[budgetStatus(figures.budget, figures.spent)]}
      />
    </div>
  );
}

/**
 * "₱… left", or the overspent amount as "−₱…" in shortfall. Without a budget,
 * what was spent. In a row from 600 it's the Left column, so it drops its word.
 */
function LeftFigure({ figures, inRow = false }: { figures: MonthFigures; inRow?: boolean }) {
  const progress = budgetProgress(figures.budget, figures.spent);
  const word = (text: string) => <span className={cn(inRow && "@[600px]:hidden")}> {text}</span>;
  if (!progress) {
    return (
      <span
        data-testid="left"
        className={cn("text-muted-foreground", inRow && "@[600px]:invisible")}
      >
        <Money kind="balance" cents={figures.spent} />
        {word("spent")}
      </span>
    );
  }
  return (
    <span data-testid="left">
      <Money kind="balance" cents={progress.left} />
      {progress.overspent ? null : word("left")}
    </span>
  );
}

function CategoryRows({
  label,
  categories,
  view,
  openId,
  onOpen,
}: {
  label: string;
  categories: CategoryRow[];
  view: MonthView;
  openId: string | null;
  onOpen: (categoryId: string) => void;
}) {
  return (
    <div className="-mx-4">
      <div
        aria-hidden="true"
        className={cn("hidden px-4 pb-1 text-caption text-muted-foreground @[600px]:grid", COLUMNS)}
      >
        <span>Category</span>
        <span className="text-right">Budget</span>
        <span className="text-right">Spent</span>
        <span className="text-right">Left</span>
      </div>
      <ul aria-label={label} className="divide-y border-y">
        {categories.map((category) => (
          <BudgetRow
            key={category.id}
            category={category}
            figures={figuresOf(view, [category])}
            open={category.id === openId}
            onOpen={() => onOpen(category.id)}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * One line on a phone (name and left) with a thin bar under it; from 600,
 * Budget, Spent and Left columns. The whole row opens the category's ledger.
 */
function BudgetRow({
  category,
  figures,
  open,
  onOpen,
}: {
  category: CategoryRow;
  figures: MonthFigures;
  open: boolean;
  onOpen: () => void;
}) {
  const progress = budgetProgress(figures.budget, figures.spent);
  const status = progress && budgetStatus(figures.budget, figures.spent);
  const badge = status && STATUS_BADGE[status];
  return (
    <li
      className={cn(
        "relative grid gap-2 px-4 py-3 transition-colors hover:bg-accent @[600px]:items-center",
        COLUMNS,
        open && "bg-accent"
      )}
    >
      <div className="flex items-center justify-between gap-3 @[600px]:contents">
        <span className="flex min-w-0 items-center gap-2">
          <RowTargetElement onClick={onOpen} open={open} className="min-w-0 text-left">
            <RecordName record={category} showRetired />
          </RowTargetElement>
          {badge && (
            <StatusBadge tone={badge.tone} className="hidden @[600px]:inline-flex">
              {badge.text}
            </StatusBadge>
          )}
        </span>
        <Column label="Budget">
          {progress ? <Money kind="balance" cents={figures.budget} /> : "None"}
        </Column>
        <Column label="Spent">
          <Money kind="balance" cents={figures.spent} />
        </Column>
        <span className="shrink-0 text-right tabular-nums">
          <LeftFigure figures={figures} inRow />
        </span>
      </div>
      {progress && status && (
        <ProgressBar
          label={`${category.name} spent`}
          value={progress.percent}
          tone={BAR_TONE[status]}
          className="h-1 @[600px]:col-span-4"
        />
      )}
    </li>
  );
}

/** A figure shown only as a column, from 600; its header is visual, so it names itself. */
function Column({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="hidden text-right text-muted-foreground tabular-nums @[600px]:block">
      <span className="sr-only">{label} </span>
      {children}
    </span>
  );
}
