import { useState, type ReactNode } from "react";
import { Link, type LinkOptions } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { BUDGET_STATUS_STYLE } from "@/components/budgets/budgetStatusStyle";
import { HeroFigure } from "@/components/app/HeroFigure";
import { ListRow } from "@/components/app/ListRow";
import { Money } from "@/components/app/Money";
import { SectionHeader } from "@/components/app/SectionHeader";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { PageShell } from "@/components/layout/PageShell";
import { useTwoPanes } from "@/components/layout/pane";
import { RowIcons } from "@/components/transactions/TransactionItem";
import { rowDisplay, totalKind, useRowNames } from "@/components/transactions/rowDisplay";
import { useFinanceOverview } from "@/hooks/useFinanceOverview";
import { useReviewCounts } from "@/hooks/useReviewCount";
import { isCreditCard } from "@/lib/accounts/events";
import { attentionFeed } from "@/lib/finances/attention";
import type { BudgetStatusCounts, FinanceOverview } from "@/lib/finances/overview";
import { readFinanceView, rememberFinanceView, type FinanceView } from "@/lib/finances/view";
import { statusOf, type ListRow as TransactionRow } from "@/lib/transactions/filter";
import { cn } from "@/lib/utils";
import { daysLeftInMonth, localMonth, monthLabel, parseLocalDate } from "@/lib/utils/dates";
import { AttentionFeed } from "./AttentionFeed";

const VIEW_OPTIONS = [
  { value: "household", label: "Household" },
  { value: "mine", label: "Mine" },
] as const;

const NOTHING_TO_REVIEW = { uncategorized: 0, drafts: 0, joinRequests: 0 };

/**
 * Home: the month's hero and what needs attention in the main column, Balances
 * and Latest beside it from 840. Below 840 it is one stack, with Budgets added.
 * `children` (the opening checklist) leads the main column.
 */
export function FinancesSection({ userId, children }: { userId: string; children?: ReactNode }) {
  const [view, setView] = useState(readFinanceView);
  const now = new Date();
  const currentMonth = localMonth(now);
  const overview = useFinanceOverview(view, userId, currentMonth);
  const reviewCounts = useReviewCounts();
  const twoColumns = useTwoPanes();

  function choose(next: FinanceView) {
    rememberFinanceView(next);
    setView(next);
  }

  const main = (
    <>
      {children}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p data-testid="finances-month" className="text-body text-muted-foreground">
          {monthLabel(currentMonth)}
        </p>
        <SegmentedControl
          label="Show finances for"
          options={VIEW_OPTIONS}
          value={view}
          onChange={choose}
        />
      </div>
      {overview && (
        <>
          <MonthFigures overview={overview} daysLeft={daysLeftInMonth(now)} />
          <AttentionFeed
            items={attentionFeed({
              budgets: overview.budgetLines,
              balances: overview.balances,
              review: reviewCounts ?? NOTHING_TO_REVIEW,
            })}
            fineBudgets={overview.budgets.fine}
          />
        </>
      )}
    </>
  );

  if (!overview) {
    return <PageShell.Main className="space-y-8">{main}</PageShell.Main>;
  }

  if (twoColumns) {
    return (
      <>
        <PageShell.Main className="space-y-8">{main}</PageShell.Main>
        <PageShell.Side className="space-y-8">
          <Balances overview={overview} view={view} />
          <Latest rows={overview.latest} />
        </PageShell.Side>
      </>
    );
  }

  return (
    <PageShell.Main className="space-y-8">
      {main}
      <Latest rows={overview.latest} />
      <Budgets counts={overview.budgets} />
      <Balances overview={overview} view={view} />
    </PageShell.Main>
  );
}

function MonthFigures({ overview, daysLeft }: { overview: FinanceOverview; daysLeft: number }) {
  return (
    <section
      aria-label="This month"
      className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3"
    >
      <HeroFigure label="Left this month" value={<Money kind="balance" cents={overview.left} />} />
      <dl className="flex gap-6 text-body">
        <Figure label="In">
          <Money {...totalKind("in", overview.in)} cents={overview.in} />
        </Figure>
        <Figure label="Out">
          <Money {...totalKind("out", overview.out)} cents={overview.out} />
        </Figure>
        <Figure label="Days left">
          <span data-testid="days-left" className="tabular-nums">
            {daysLeft}
          </span>
        </Figure>
      </dl>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function SeeAll({ link, children }: { link: LinkOptions; children: string }) {
  return (
    <Link
      {...link}
      className="inline-flex items-center gap-1 text-body font-medium text-primary hover:underline"
    >
      {children}
      <ChevronRight aria-hidden className="size-4" />
    </Link>
  );
}

function Balances({ overview, view }: { overview: FinanceOverview; view: FinanceView }) {
  return (
    <section className="space-y-2">
      <SectionHeader
        title="Balances"
        action={<SeeAll link={{ to: "/accounts" }}>Accounts</SeeAll>}
      />
      {overview.balances.length === 0 ? (
        <EmptyState>
          {view === "mine"
            ? "No Personal accounts yet. Add one under Accounts to see your own money here."
            : "No Household accounts yet. Add one under Accounts to see the household’s money here."}
        </EmptyState>
      ) : (
        <ul aria-label="Balances" className="divide-y border-y">
          {overview.balances.map(({ account, balance }) => (
            <li key={account.id}>
              <ListRow
                link={{ to: "/accounts", search: { open: account.id } }}
                className="px-0"
                label={account.name}
                amount={
                  <>
                    {isCreditCard(account) && <span className="text-muted-foreground">Owed </span>}
                    <Money kind="balance" owed={isCreditCard(account)} cents={balance} />
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Budgets({ counts }: { counts: BudgetStatusCounts }) {
  const none = counts.fine + counts.close + counts.over === 0;
  return (
    <section className="space-y-2">
      <SectionHeader title="Budgets" action={<SeeAll link={{ to: "/budget" }}>Budget</SeeAll>} />
      {none ? (
        <EmptyState>No budgets this month.</EmptyState>
      ) : (
        <dl className="grid grid-cols-3 gap-2 border-y py-3">
          <Count label="Fine" count={counts.fine} />
          <Count label="Close" count={counts.close} className={BUDGET_STATUS_STYLE.close.color} />
          <Count label="Over" count={counts.over} className={BUDGET_STATUS_STYLE.over.color} />
        </dl>
      )}
    </section>
  );
}

function Count({ label, count, className }: { label: string; count: number; className?: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={cn("text-heading tabular-nums", count > 0 && className)}>{count}</dd>
    </div>
  );
}

function Latest({ rows }: { rows: TransactionRow[] }) {
  const names = useRowNames();

  return (
    <section className="space-y-2">
      <SectionHeader
        title="Latest"
        action={<SeeAll link={{ to: "/transactions" }}>See all</SeeAll>}
      />
      {rows.length === 0 ? (
        <EmptyState>No transactions yet.</EmptyState>
      ) : (
        <ul aria-label="Latest transactions" className="divide-y border-y">
          {rows.map((row) => {
            const { label, amount } = rowDisplay(row, names);
            const pending = statusOf(row) === "pending";
            return (
              <li key={row.id}>
                <ListRow
                  link={{ to: "/transactions", search: { open: row.id } }}
                  className="px-0"
                  leading={
                    <span className="w-12 shrink-0 text-caption text-muted-foreground">
                      {format(parseLocalDate(row.date), "MMM d")}
                    </span>
                  }
                  label={label}
                  muted={pending}
                  amount={
                    <span className="flex items-center gap-2">
                      <RowIcons row={row} />
                      <Money
                        {...amount}
                        cents={row.amountCents}
                        className={cn(pending && "text-muted-foreground")}
                      />
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
