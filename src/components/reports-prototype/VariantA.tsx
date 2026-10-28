/**
 * PROTOTYPE (#259) variant A, "Report page": one column read top to bottom.
 * The month bars pick the month; group rows expand in place; a category row
 * opens Transactions filtered to that month and category (no new filters needed).
 */

import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/app/Button";
import { EmptyState } from "@/components/app/EmptyState";
import { HeroFigure } from "@/components/app/HeroFigure";
import { Money } from "@/components/app/Money";
import { SectionHeader } from "@/components/app/SectionHeader";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { PageShell } from "@/components/layout/PageShell";
import { absCents, diffCents, divideCents, type Cents } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { monthLabel, shiftMonth } from "@/lib/utils/dates";
import { HBar, MonthBars } from "./charts";
import { groupSpentIn, lastMonths, spentIn, totalSpentIn } from "./data";
import {
  PERIOD_MONTHS,
  PERIOD_OPTIONS,
  VIEW_OPTIONS,
  type Period,
  type VariantProps,
} from "./search";

const COMPARE_OPTIONS = PERIOD_OPTIONS.filter((option) => option.value !== "1m");

export function VariantA({
  data,
  view,
  onViewChange,
  search,
  setSearch,
  currentMonth,
}: VariantProps) {
  const month = search.month ?? currentMonth;
  const period: Period = search.period === "1m" ? "6m" : search.period;
  const compared = lastMonths(currentMonth, PERIOD_MONTHS[period]);
  const spent = totalSpentIn(data, [month]);
  const previous = shiftMonth(month, -1);
  const previousSpent = totalSpentIn(data, [previous]);
  const change = diffCents(spent, previousSpent);
  const hasPrevious = data.monthsWithSpending.includes(previous);
  const groups = data.groups
    .map((group) => ({ group, cents: groupSpentIn(group, [month]) }))
    .filter(({ cents }) => cents !== 0)
    .sort((a, b) => b.cents - a.cents);
  const maxGroup = groups[0]?.cents ?? (0 as Cents);
  const isCurrent = month === currentMonth;

  return (
    <PageShell>
      <PageShell.Main className="space-y-8 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() => setSearch({ month: shiftMonth(month, -1) })}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <p className="min-w-36 text-center text-body font-medium">{monthLabel(month)}</p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              disabled={isCurrent}
              onClick={() => setSearch({ month: shiftMonth(month, 1) })}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <SegmentedControl
            label="Show reports for"
            options={VIEW_OPTIONS}
            value={view}
            onChange={onViewChange}
          />
        </div>

        <HeroFigure
          label={isCurrent ? "Spent so far this month" : `Spent in ${monthLabel(month)}`}
          value={<Money kind="balance" cents={spent} />}
          caption={
            hasPrevious ? (
              <>
                <Money kind="balance" cents={absCents(change)} /> {change >= 0 ? "more" : "less"}{" "}
                than {monthLabel(previous)}
                {isCurrent && " at month end"}
              </>
            ) : (
              "No earlier month to compare yet."
            )
          }
        />

        <section className="space-y-3">
          <SectionHeader
            title="Months compared"
            action={
              <SegmentedControl
                label="Months to compare"
                options={COMPARE_OPTIONS}
                value={period}
                onChange={(next) => setSearch({ period: next })}
              />
            }
          />
          {data.monthsWithSpending.length < 2 ? (
            <EmptyState>
              Months compared shows once two months have spending.{" "}
              {data.monthsWithSpending[0]
                ? `${monthLabel(data.monthsWithSpending[0])} is the first.`
                : "Nothing is recorded yet."}
            </EmptyState>
          ) : (
            <>
              <MonthBars
                label={`Spending per month, ${monthLabel(compared[0] ?? month)} to ${monthLabel(currentMonth)}`}
                bars={compared.map((barMonth) => ({
                  month: barMonth,
                  cents: totalSpentIn(data, [barMonth]),
                  main: barMonth === currentMonth,
                  selected: barMonth === month,
                  onSelect: () => setSearch({ month: barMonth, group: undefined }),
                }))}
              />
              <p className="text-caption text-muted-foreground">
                Average{" "}
                <Money
                  kind="balance"
                  cents={divideCents(totalSpentIn(data, compared), compared.length)}
                />{" "}
                a month. Tap a month to see its groups.
              </p>
            </>
          )}
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="By group"
            action={
              <Link
                to="/transactions"
                search={{ month, type: "expense" }}
                className="text-body font-medium text-primary underline-offset-4 hover:underline"
              >
                All transactions
              </Link>
            }
          />
          {groups.length === 0 ? (
            <EmptyState>No spending in {monthLabel(month)}.</EmptyState>
          ) : (
            <ul className="divide-y">
              {groups.map(({ group, cents }) => {
                const expanded = search.group === group.id;
                const share = spent > 0 ? Math.round((cents / spent) * 100) : 0;
                return (
                  <li key={group.id}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setSearch({ group: expanded ? undefined : group.id })}
                      className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 py-3 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 @[600px]:grid-cols-[10rem_1fr_auto]"
                    >
                      <span className="flex items-center gap-1 text-body font-medium">
                        <ChevronDown
                          aria-hidden="true"
                          className={cn("size-4 transition-transform", !expanded && "-rotate-90")}
                        />
                        {group.name}
                      </span>
                      <HBar
                        cents={cents}
                        max={maxGroup}
                        className="col-span-2 row-start-2 @[600px]:col-span-1 @[600px]:col-start-2 @[600px]:row-start-1"
                      />
                      <span className="text-body tabular-nums">
                        <Money kind="balance" cents={cents} />
                        <span className="ml-2 text-caption text-muted-foreground">{share}%</span>
                      </span>
                    </button>
                    {expanded && (
                      <ul className="mb-3 space-y-1 border-l-2 pl-4">
                        {group.categories
                          .map((category) => ({ category, cents: spentIn(category, [month]) }))
                          .filter((row) => row.cents !== 0)
                          .sort((a, b) => b.cents - a.cents)
                          .map(({ category, cents: categoryCents }) => {
                            const budget = category.budgetByMonth.get(month);
                            const over = budget !== undefined && categoryCents > budget;
                            return (
                              <li key={category.key}>
                                <Link
                                  to="/transactions"
                                  search={{ month, category: category.key }}
                                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-sm py-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 @[600px]:grid-cols-[9rem_1fr_auto]"
                                >
                                  <span className="truncate text-body">{category.name}</span>
                                  <HBar
                                    cents={categoryCents}
                                    max={cents}
                                    budget={budget}
                                    tone="chart"
                                    className="col-span-2 row-start-2 @[600px]:col-span-1 @[600px]:col-start-2 @[600px]:row-start-1"
                                  />
                                  <span className="text-right text-body tabular-nums">
                                    <Money kind="balance" cents={categoryCents} />
                                    {budget !== undefined && (
                                      <span
                                        className={cn(
                                          "block text-caption",
                                          over ? "text-shortfall" : "text-muted-foreground"
                                        )}
                                      >
                                        {over ? (
                                          <>
                                            <Money
                                              kind="balance"
                                              cents={diffCents(categoryCents, budget)}
                                            />{" "}
                                            over
                                          </>
                                        ) : (
                                          <>
                                            of <Money kind="balance" cents={budget} />
                                          </>
                                        )}
                                      </span>
                                    )}
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </PageShell.Main>
    </PageShell>
  );
}
