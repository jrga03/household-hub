/* eslint-disable arch/no-direct-primitive-import -- prototype (#194), throwaway branch */
// PROTOTYPE (#194): Home B, a dashboard of cards.
import type { ReactNode } from "react";
import { ChevronRight, CreditCard, Landmark, Smartphone, Wallet } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  ACCOUNTS,
  MONTH_IN,
  MONTH_LABEL,
  MONTH_LEFT,
  MONTH_OUT,
  ROWS,
  budgetStatus,
  leftOf,
  type Account,
} from "../fixtures";
import {
  Balance,
  CASH_ON_HAND,
  CATEGORIES,
  RowAmount,
  RowIcons,
  formatSigned,
  overBy,
  percentSpent,
  rowDetail,
  shortDate,
} from "./money";

const KIND_ICON: Record<Account["kind"], typeof Wallet> = {
  bank: Landmark,
  cash: Wallet,
  "e-wallet": Smartphone,
  "credit card": CreditCard,
};

/** The three categories with the least budget left, relative to their budget. */
const TIGHTEST = CATEGORIES.filter((category) => category.budget !== null)
  .sort((a, b) => percentSpent(b) - percentSpent(a) || a.spent - b.spent)
  .slice(0, 3);

export function HomeB() {
  return (
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 @[840px]:grid-cols-3 @[840px]:py-8">
      <HeroCard />
      <AccountsCard />
      <BudgetCard />
      <LatestCard />
    </div>
  );
}

function Card({
  title,
  link,
  className,
  children,
}: {
  title: string;
  link?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "min-w-0 space-y-3 rounded-lg border bg-card p-4 text-card-foreground",
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-heading">{title}</h2>
        {link && (
          <a
            href="#prototype"
            className="inline-flex items-center gap-1 text-body font-medium text-primary hover:underline"
          >
            {link}
            <ChevronRight className="size-4" aria-hidden />
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

function HeroCard() {
  return (
    <section
      aria-label="Cash on hand"
      className="space-y-4 rounded-lg border bg-card p-4 @[840px]:col-span-2"
    >
      <div className="space-y-1">
        <p className="text-label text-muted-foreground">Cash on hand</p>
        <p className="text-figure tabular-nums">{formatSigned(CASH_ON_HAND)}</p>
        <p className="text-caption text-muted-foreground">
          Banks, cash and e-wallets. Credit cards not counted.
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2 rounded-md bg-muted p-3">
        <Stat label="In" value={`+${formatPHP(MONTH_IN)}`} className="text-income" />
        <Stat label="Out" value={`−${formatPHP(MONTH_OUT)}`} />
        <Stat
          label="Left"
          value={formatSigned(MONTH_LEFT)}
          className={MONTH_LEFT < 0 ? "text-shortfall" : undefined}
        />
      </dl>
      <p className="text-caption text-muted-foreground">{MONTH_LABEL}</p>
    </section>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={cn("truncate font-medium tabular-nums", className)}>{value}</dd>
    </div>
  );
}

function AccountsCard() {
  return (
    <Card title="Accounts" link="All" className="@[840px]:row-span-2">
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 @[840px]:mx-0 @[840px]:flex-col @[840px]:overflow-visible @[840px]:px-0">
        {ACCOUNTS.map((account) => {
          const Icon = KIND_ICON[account.kind];
          return (
            <li key={account.id} className="w-40 shrink-0 snap-start @[840px]:w-auto">
              <a
                href="#prototype"
                className="flex h-full flex-col gap-2 rounded-md border bg-background p-3 hover:bg-accent"
              >
                <span className="flex items-center gap-2 text-body text-muted-foreground">
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{account.name}</span>
                </span>
                <Balance account={account} className="text-left font-medium" />
              </a>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function BudgetCard() {
  return (
    <Card title="Tightest budgets" link="Budget">
      <ul className="space-y-4">
        {TIGHTEST.map((category) => {
          const left = leftOf(category);
          const over = budgetStatus(category) === "over";
          return (
            <li key={category.id} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{category.name}</span>
                <span className={cn("shrink-0 text-body tabular-nums", over && "text-shortfall")}>
                  {over ? `${formatPHP(overBy(category))} over` : `${formatPHP(left)} left`}
                </span>
              </div>
              <Progress
                aria-label={`${category.name} spent`}
                value={percentSpent(category)}
                className={cn("h-1.5", over && "bg-shortfall/20")}
                indicatorClassName={
                  over
                    ? "bg-shortfall"
                    : budgetStatus(category) === "close"
                      ? "bg-warning"
                      : undefined
                }
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function LatestCard() {
  return (
    <Card title="Latest" link="All">
      <ul className="divide-y">
        {ROWS.slice(0, 5).map((row) => (
          <li key={row.id} className="py-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-medium",
                  row.pending && "text-muted-foreground"
                )}
              >
                {row.label}
              </span>
              <RowIcons row={row} />
              <RowAmount row={row} />
            </div>
            <p className="truncate text-caption text-muted-foreground">
              {shortDate(row.date)} · {rowDetail(row)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
