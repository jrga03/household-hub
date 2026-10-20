// PROTOTYPE (#194): Home A, quiet sections on the page, no card boxes.
import type { ReactNode } from "react";
import { ChevronRight, CircleAlert, ClipboardCheck } from "lucide-react";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  ACCOUNTS,
  MONTH_IN,
  MONTH_LABEL,
  MONTH_LEFT,
  MONTH_OUT,
  REVIEW_COUNT,
  ROWS,
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
  rowDetail,
  shortDate,
} from "./money";

export function HomeA() {
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-6 @[840px]:grid-cols-[3fr_2fr] @[840px]:gap-12 @[840px]:py-8">
      {/* Phones read hero, attention, latest, budgets, balances; the laptop splits them in two columns. */}
      <div className="contents @[840px]:block @[840px]:space-y-8">
        <div className="order-1">
          <Hero />
        </div>
        <div className="order-3">
          <Latest />
        </div>
      </div>
      <div className="contents @[840px]:block @[840px]:space-y-8">
        <div className="order-2">
          <Attention />
        </div>
        <div className="order-4">
          <Budgets />
        </div>
        <div className="order-5">
          <Balances />
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section aria-label="This month" className="space-y-1">
      <p className="text-label text-muted-foreground">Left this month · {MONTH_LABEL}</p>
      <p className={cn("text-figure tabular-nums", MONTH_LEFT < 0 && "text-shortfall")}>
        {formatSigned(MONTH_LEFT)}
      </p>
      <p className="text-body text-muted-foreground tabular-nums">
        In <span className="text-income">+{formatPHP(MONTH_IN)}</span> · Out −{formatPHP(MONTH_OUT)}
      </p>
    </section>
  );
}

function Section({ title, link, children }: { title: string; link?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
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

const rowClass = "flex items-center justify-between gap-3 py-3";

function Attention() {
  return (
    <Section title="Needs attention">
      <ul className="divide-y border-y">
        <li>
          <a href="#prototype" className={rowClass}>
            <span className="flex min-w-0 items-center gap-3">
              <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{REVIEW_COUNT} items to review</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </a>
        </li>
        {OVER.map((category) => (
          <li key={category.id}>
            <a href="#prototype" className={rowClass}>
              <span className="flex min-w-0 items-center gap-3">
                <CircleAlert className="size-4 shrink-0 text-shortfall" aria-hidden />
                <span className="truncate">{category.name}</span>
              </span>
              <span className="shrink-0 text-shortfall tabular-nums">
                {formatPHP(overBy(category))} over
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Budgets() {
  const budgeted = CATEGORIES.filter((category) => category.budget !== null).length;
  return (
    <Section title="Budgets" link="Budget">
      <p className="text-body text-muted-foreground">
        {budgeted} categories with a budget this month.
      </p>
      <dl className="grid grid-cols-3 gap-2 border-y py-3">
        <Count label="Fine" count={STATUS_COUNTS.fine} />
        <Count label="Close" count={STATUS_COUNTS.close} className="text-warning" />
        <Count label="Over" count={STATUS_COUNTS.over} className="text-shortfall" />
      </dl>
    </Section>
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

function Balances() {
  return (
    <Section title="Balances" link="Accounts">
      <ul className="divide-y border-y">
        {ACCOUNTS.map((account) => (
          <li key={account.id}>
            <a href="#prototype" className={rowClass}>
              <span className="truncate">{account.name}</span>
              <Balance account={account} />
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Latest() {
  return (
    <Section title="Latest" link="See all">
      <ul className="divide-y border-y">
        {ROWS.slice(0, 5).map((row) => (
          <li key={row.id} className="py-3">
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
            <p className="truncate text-body text-muted-foreground">
              {shortDate(row.date)} · {rowDetail(row)}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
