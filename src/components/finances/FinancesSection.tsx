import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowLeftRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { categoryNames } from "@/components/allocations/envelopes";
import { useAccountNames } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { useFinanceOverview } from "@/hooks/useFinanceOverview";
import { isCreditCard } from "@/lib/accounts/events";
import { formatPHP, type Cents } from "@/lib/currency";
import type { BudgetStatusCounts, FinanceOverview, FinanceView } from "@/lib/finances/overview";
import { readFinanceView, rememberFinanceView } from "@/lib/finances/view";
import { isTransfer, type ListRow } from "@/lib/transactions/filter";
import { localMonth, monthLabel, parseLocalDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

const VIEW_LABELS: Record<FinanceView, string> = { household: "Household", mine: "Mine" };

const linkClass = "inline-flex items-center gap-1 text-sm font-medium hover:underline";

/** The current month at a glance, for Household accounts or the member's Personal ones. */
export function FinancesSection({ userId }: { userId: string }) {
  const [view, setView] = useState(readFinanceView);
  const currentMonth = localMonth(new Date());
  const overview = useFinanceOverview(view, userId, currentMonth);

  function choose(next: FinanceView) {
    rememberFinanceView(next);
    setView(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finances</CardTitle>
        <CardDescription data-testid="finances-month">{monthLabel(currentMonth)}</CardDescription>
        <CardAction>
          <div role="group" aria-label="Show finances for" className="flex rounded-md border p-0.5">
            {(["household", "mine"] as const).map((option) => (
              <Button
                key={option}
                variant={view === option ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={view === option}
                onClick={() => choose(option)}
              >
                {VIEW_LABELS[option]}
              </Button>
            ))}
          </div>
        </CardAction>
      </CardHeader>
      {overview && (
        <CardContent className="@container">
          <FinancesBlocks overview={overview} view={view} currentMonth={currentMonth} />
        </CardContent>
      )}
    </Card>
  );
}

function FinancesBlocks({
  overview,
  view,
  currentMonth,
}: {
  overview: FinanceOverview;
  view: FinanceView;
  currentMonth: string;
}) {
  if (overview.balances.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {view === "mine"
          ? "No Personal accounts yet. Add one under Accounts to see your own money here."
          : "No Household accounts yet. Add one under Accounts to see the household's money here."}
      </p>
    );
  }

  return (
    <div className="grid gap-4 @[600px]:grid-cols-2">
      <Block
        title="This month"
        link={
          <Link to="/transactions" search={{ month: currentMonth }} className={linkClass}>
            Transactions <ChevronRight aria-hidden className="size-4" />
          </Link>
        }
      >
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <Figure label="In" cents={overview.in} />
          <Figure label="Out" cents={overview.out} />
          <Figure label="Left" cents={overview.left} />
        </dl>
      </Block>

      <Block
        title="Budgets"
        link={
          <Link to="/budget" className={linkClass}>
            Budget <ChevronRight aria-hidden className="size-4" />
          </Link>
        }
      >
        <BudgetCounts counts={overview.budgets} />
      </Block>

      <Block title="Balances">
        <ul aria-label="Balances" className="divide-y text-sm">
          {overview.balances.map(({ account, balance }) => (
            <li key={account.id}>
              <Link
                to="/accounts"
                hash={`account-${account.id}`}
                className="flex items-center justify-between gap-3 py-1.5 hover:underline"
              >
                <span className="truncate">{account.name}</span>
                <span className="shrink-0 tabular-nums">
                  {isCreditCard(account) && <span className="text-muted-foreground">Owed </span>}
                  {formatPHP(balance)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Block>

      <Block
        title="Latest"
        link={
          <Link to="/transactions" className={linkClass}>
            All <ChevronRight aria-hidden className="size-4" />
          </Link>
        }
      >
        <LatestTransactions rows={overview.latest} />
      </Block>
    </div>
  );
}

function Block({
  title,
  link,
  children,
}: {
  title: string;
  link?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {link}
      </div>
      {children}
    </section>
  );
}

function Figure({ label, cents }: { label: string; cents: Cents }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("truncate font-medium tabular-nums", cents < 0 && "text-destructive")}>
        {formatPHP(cents)}
      </dd>
    </div>
  );
}

function BudgetCounts({ counts }: { counts: BudgetStatusCounts }) {
  if (counts.fine + counts.close + counts.over === 0) {
    return <p className="text-sm text-muted-foreground">No budgets this month.</p>;
  }
  return (
    <dl className="grid grid-cols-3 gap-2 text-sm">
      <Count label="Fine" count={counts.fine} />
      <Count
        label="Close"
        count={counts.close}
        className={counts.close > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
      />
      <Count
        label="Over"
        count={counts.over}
        className={counts.over > 0 ? "text-destructive" : undefined}
      />
    </dl>
  );
}

function Count({ label, count, className }: { label: string; count: number; className?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium tabular-nums", className)}>{count}</dd>
    </div>
  );
}

const MONEY_IN = { sign: "+", className: "text-green-700 dark:text-green-400" };
const MONEY_OUT = { sign: "−", className: undefined };
const MONEY_MOVED = { sign: "", className: "text-muted-foreground" };

function LatestTransactions({ rows }: { rows: ListRow[] }) {
  const accountNames = useAccountNames();
  const categories = useCategoryList();
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
  }

  const namesOfCategories = categories ? categoryNames(categories) : new Map<string, string>();
  const accountName = (id: string) => accountNames?.get(id) ?? "Account not on this device yet";
  const display = (row: ListRow) => {
    if (isTransfer(row)) {
      const path = `${accountName(row.fromAccountId)} → ${accountName(row.toAccountId)}`;
      return { label: row.description || path, transfer: true, amount: MONEY_MOVED };
    }
    const categoryName =
      row.categoryId === null
        ? "Unassigned"
        : (namesOfCategories.get(row.categoryId) ?? "Category not on this device yet");
    return {
      label: row.description || categoryName,
      transfer: false,
      amount: row.type === "income" ? MONEY_IN : MONEY_OUT,
    };
  };

  return (
    <ul aria-label="Latest transactions" className="divide-y text-sm">
      {rows.map((row) => {
        const { label, transfer, amount } = display(row);
        return (
          <li key={row.id} className="flex items-center justify-between gap-3 py-1.5">
            <span className="flex min-w-0 items-center gap-1.5">
              {transfer && (
                <ArrowLeftRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-label="Transfer"
                />
              )}
              <span className="truncate">{label}</span>
              <span className="shrink-0 text-muted-foreground">
                {format(parseLocalDate(row.date), "MMM d")}
              </span>
            </span>
            <span className={cn("shrink-0 tabular-nums", amount.className)}>
              {amount.sign}
              {formatPHP(row.amountCents)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
