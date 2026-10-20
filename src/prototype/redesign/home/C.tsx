/* eslint-disable arch/no-direct-primitive-import -- prototype (#194), throwaway branch */
// PROTOTYPE (#194): Home C, a feed of what needs attention, sorted by urgency.
import type { ReactNode } from "react";
import { ChevronRight, CircleAlert, CircleCheck, ClipboardCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  ACCOUNTS,
  DAY_OF_MONTH,
  DAYS_IN_MONTH,
  MONTH_IN,
  MONTH_LABEL,
  MONTH_LEFT,
  MONTH_OUT,
  REVIEW_COUNT,
  ROWS,
  budgetStatus,
  leftOf,
} from "../fixtures";
import {
  Balance,
  CATEGORIES,
  OVER,
  RowAmount,
  RowIcons,
  STATUS_COUNTS,
  formatSigned,
  overBy,
  shortDate,
} from "./money";

type Urgency = "short" | "check" | "todo";

interface FeedItem {
  id: string;
  urgency: Urgency;
  text: ReactNode;
  detail: string;
}

const DAYS_LEFT = DAYS_IN_MONTH - DAY_OF_MONTH;

const FEED: FeedItem[] = [
  ...OVER.map((category) => ({
    id: category.id,
    urgency: "short" as const,
    text: (
      <>
        {category.name} is{" "}
        <span className="text-shortfall">{formatPHP(overBy(category))} over</span>
      </>
    ),
    detail: `Budget ${formatPHP(category.budget ?? category.spent)} · Spent ${formatPHP(category.spent)}`,
  })),
  ...ACCOUNTS.filter((account) => account.kind !== "credit card" && account.balance < 0).map(
    (account) => ({
      id: account.id,
      urgency: "short" as const,
      text: (
        <>
          {account.name} is at{" "}
          <span className="text-shortfall">{formatSigned(account.balance)}</span>
        </>
      ),
      detail: "Move money in or check its transactions",
    })
  ),
  ...CATEGORIES.filter(
    // A bill paid in full is done, not close.
    (category) => budgetStatus(category) === "close" && leftOf(category) > 0
  ).map((category) => ({
    id: category.id,
    urgency: "check" as const,
    text: `${category.name} has ${formatPHP(leftOf(category))} left with ${DAYS_LEFT} days to go`,
    detail: `Budget ${formatPHP(category.budget ?? category.spent)}`,
  })),
  {
    id: "review",
    urgency: "todo",
    text: `${REVIEW_COUNT} expenses need a category`,
    detail: "Review",
  },
];

const URGENCY: Record<Urgency, { icon: typeof Clock; iconClass: string; badge: ReactNode }> = {
  short: {
    icon: CircleAlert,
    iconClass: "text-shortfall",
    badge: (
      <Badge variant="outline" className="text-shortfall">
        Short
      </Badge>
    ),
  },
  check: { icon: Clock, iconClass: "text-warning", badge: <Badge variant="warning">Check</Badge> },
  todo: {
    icon: ClipboardCheck,
    iconClass: "text-muted-foreground",
    badge: <Badge variant="secondary">To do</Badge>,
  },
};

export function HomeC() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 @[840px]:grid-cols-[2fr_1fr] @[840px]:py-8">
      <div className="min-w-0 space-y-6">
        <MonthHeader />
        <Feed />
      </div>
      <div className="min-w-0 space-y-8">
        <SideList title="Balances">
          {ACCOUNTS.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate">{account.name}</span>
              <Balance account={account} />
            </li>
          ))}
        </SideList>
        <SideList title="Latest">
          {ROWS.slice(0, 5).map((row) => (
            <li key={row.id} className="flex items-center gap-2 py-2">
              <span className="w-12 shrink-0 text-caption text-muted-foreground">
                {shortDate(row.date)}
              </span>
              <span
                className={cn("min-w-0 flex-1 truncate", row.pending && "text-muted-foreground")}
              >
                {row.label}
              </span>
              <RowIcons row={row} />
              <RowAmount row={row} />
            </li>
          ))}
        </SideList>
      </div>
    </div>
  );
}

function MonthHeader() {
  return (
    <section
      aria-label="This month"
      className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2"
    >
      <div>
        <p className="text-label text-muted-foreground">Left in {MONTH_LABEL}</p>
        <p className={cn("text-figure tabular-nums", MONTH_LEFT < 0 && "text-shortfall")}>
          {formatSigned(MONTH_LEFT)}
        </p>
      </div>
      <dl className="flex gap-6 text-body tabular-nums">
        <div>
          <dt className="text-caption text-muted-foreground">In</dt>
          <dd className="text-income">+{formatPHP(MONTH_IN)}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Out</dt>
          <dd>−{formatPHP(MONTH_OUT)}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Days left</dt>
          <dd>{DAYS_LEFT}</dd>
        </div>
      </dl>
    </section>
  );
}

function Feed() {
  return (
    <section aria-label="Needs attention" className="space-y-2">
      <h2 className="text-heading">Needs attention</h2>
      <ul className="divide-y rounded-lg border bg-card">
        {FEED.map((item) => {
          const { icon: Icon, iconClass, badge } = URGENCY[item.urgency];
          return (
            <li key={item.id}>
              <a href="#prototype" className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
                <Icon className={cn("size-5 shrink-0", iconClass)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium tabular-nums">{item.text}</span>
                  <span className="block truncate text-body text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
                <span className="hidden @[600px]:inline-flex">{badge}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </a>
            </li>
          );
        })}
      </ul>
      <p className="flex items-center gap-2 text-body text-muted-foreground">
        <CircleCheck className="size-4 text-success" aria-hidden />
        {STATUS_COUNTS.fine} budgets are fine.
      </p>
    </section>
  );
}

function SideList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-heading">{title}</h2>
        <a
          href="#prototype"
          className="inline-flex items-center gap-1 text-body font-medium text-primary hover:underline"
        >
          See all
          <ChevronRight className="size-4" aria-hidden />
        </a>
      </div>
      <ul className="divide-y border-y">{children}</ul>
    </section>
  );
}
