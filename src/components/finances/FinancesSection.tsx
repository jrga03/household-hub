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
import type { BudgetStatusCounts, FinanceOverview, FinanceScope } from "@/lib/finances/overview";
import { readFinanceScope, rememberFinanceScope } from "@/lib/finances/scope";
import { isTransfer, type ListRow } from "@/lib/transactions/filter";
import { localMonth, monthLabel, parseLocalDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

const SCOPE_LABELS: Record<FinanceScope, string> = { household: "Household", mine: "Mine" };

const linkClass = "inline-flex items-center gap-1 text-sm font-medium hover:underline";

/** The current month at a glance, for Household accounts or the member's Personal ones. */
export function FinancesSection({ userId }: { userId: string }) {
  const [scope, setScope] = useState(readFinanceScope);
  const currentMonth = localMonth(new Date());
  const overview = useFinanceOverview(scope, userId, currentMonth);

  function choose(next: FinanceScope) {
    rememberFinanceScope(next);
    setScope(next);
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
                variant={scope === option ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={scope === option}
                onClick={() => choose(option)}
              >
                {SCOPE_LABELS[option]}
              </Button>
            ))}
          </div>
        </CardAction>
      </CardHeader>
      {overview && (
        <CardContent className="@container">
          <FinancesBlocks overview={overview} scope={scope} currentMonth={currentMonth} />
        </CardContent>
      )}
    </Card>
  );
}

function FinancesBlocks({
  overview,
  scope,
  currentMonth,
}: {
  overview: FinanceOverview;
  scope: FinanceScope;
  currentMonth: string;
}) {
  if (overview.balances.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {scope === "mine"
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
          <Link to="/categories" className={linkClass}>
            Categories <ChevronRight aria-hidden className="size-4" />
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
                to="/transactions"
                search={{ account: account.id }}
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
        <LatestEntries rows={overview.latest} />
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

function LatestEntries({ rows }: { rows: ListRow[] }) {
  const accountNames = useAccountNames();
  const categories = useCategoryList();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;

  const namesOfCategories = categories ? categoryNames(categories) : new Map<string, string>();
  const accountName = (id: string) => accountNames?.get(id) ?? "Account not on this device yet";
  const label = (row: ListRow) => {
    if (row.description) return row.description;
    if (isTransfer(row))
      return `${accountName(row.fromAccountId)} → ${accountName(row.toAccountId)}`;
    if (row.categoryId === null) return "Unassigned";
    return namesOfCategories.get(row.categoryId) ?? "Category not on this device yet";
  };
  const sign = (row: ListRow) => (isTransfer(row) ? "" : row.type === "income" ? "+" : "−");

  return (
    <ul aria-label="Latest entries" className="divide-y text-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 py-1.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {isTransfer(row) && (
              <ArrowLeftRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-label="Transfer"
              />
            )}
            <span className="truncate">{label(row)}</span>
            <span className="shrink-0 text-muted-foreground">
              {format(parseLocalDate(row.date), "MMM d")}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 tabular-nums",
              !isTransfer(row) && row.type === "income" && "text-green-700 dark:text-green-400",
              isTransfer(row) && "text-muted-foreground"
            )}
          >
            {sign(row)}
            {formatPHP(row.amountCents)}
          </span>
        </li>
      ))}
    </ul>
  );
}
