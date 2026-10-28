/**
 * PROTOTYPE (#259) variant C, "Month grid": groups and categories down the
 * side, months across, a bar in every cell. A cell picks one category in one
 * month; the side pane shows it with its transactions and the way out to
 * Transactions. With nothing picked, the side shows the trend and the biggest changes.
 */

import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Button } from "@/components/app/Button";
import { EmptyState } from "@/components/app/EmptyState";
import { HeroFigure } from "@/components/app/HeroFigure";
import { ListRow } from "@/components/app/ListRow";
import { Money, spokenMoney } from "@/components/app/Money";
import { SectionHeader } from "@/components/app/SectionHeader";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { PageShell } from "@/components/layout/PageShell";
import { useTwoPanes } from "@/components/layout/pane";
import {
  absCents,
  diffCents,
  divideCents,
  formatPHPAxisTick,
  sumCents,
  ZERO_CENTS,
  type Cents,
} from "@/lib/currency";
import { cn } from "@/lib/utils";
import { monthLabel, parseLocalDate, shiftMonth } from "@/lib/utils/dates";
import { shortMonth, TrendLine } from "./charts";
import {
  allCategories,
  findCategory,
  groupSpentIn,
  lastMonths,
  linesFor,
  spentIn,
  totalSpentIn,
  type ReportData,
} from "./data";
import {
  PERIOD_MONTHS,
  PERIOD_OPTIONS,
  VIEW_OPTIONS,
  type Period,
  type VariantProps,
} from "./search";

const GRID_OPTIONS = PERIOD_OPTIONS.filter((option) => option.value !== "1m");
const ALL = "all";
const GROUP_PREFIX = "group:";
const LINES_SHOWN = 10;

interface Cell {
  /** A category key, GROUP_PREFIX + group id, or ALL. */
  key: string;
  month: string;
}

function readCell(value: string | undefined): Cell | null {
  if (!value) return null;
  const at = value.lastIndexOf("@");
  return at > 0 ? { key: value.slice(0, at), month: value.slice(at + 1) } : null;
}

export function VariantC({
  data,
  view,
  onViewChange,
  search,
  setSearch,
  currentMonth,
}: VariantProps) {
  const period: Period = search.period === "1m" ? "6m" : search.period;
  const months = lastMonths(currentMonth, PERIOD_MONTHS[period]);
  const cell = readCell(search.cell);
  const pick = (key: string, month: string) => {
    const value = `${key}@${month}`;
    setSearch({ cell: search.cell === value ? undefined : value });
  };
  const isPicked = (key: string, month: string) => cell?.key === key && cell.month === month;

  return (
    <PageShell variant="supporting-pane">
      <PageShell.Main className="space-y-4 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            label="Months shown"
            options={GRID_OPTIONS}
            value={period}
            onChange={(next) => setSearch({ period: next })}
          />
          <SegmentedControl
            label="Show reports for"
            options={VIEW_OPTIONS}
            value={view}
            onChange={onViewChange}
          />
        </div>

        {data.groups.length === 0 ? (
          <EmptyState>No spending yet. It shows here once transactions have a category.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-body">
              <caption className="sr-only">Spending by category and month</caption>
              <thead>
                <tr className="border-b">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-background p-2 text-left text-label font-medium"
                  >
                    Category
                  </th>
                  {months.map((month) => (
                    <th key={month} scope="col" className="p-1 text-right">
                      <button
                        type="button"
                        aria-pressed={isPicked(ALL, month)}
                        aria-label={monthLabel(month)}
                        onClick={() => pick(ALL, month)}
                        className={cn(
                          "w-full rounded-sm px-1 py-1 text-right text-label font-medium hover:underline",
                          isPicked(ALL, month)
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground",
                          month === currentMonth && !isPicked(ALL, month) && "text-foreground"
                        )}
                      >
                        {shortMonth(month)}
                      </button>
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="hidden p-2 text-right text-label font-medium text-muted-foreground @[600px]:table-cell"
                  >
                    Average
                  </th>
                </tr>
              </thead>
              {data.groups.map((group) => {
                const groupKey = `${GROUP_PREFIX}${group.id}`;
                return (
                  <tbody key={group.id} className="border-b">
                    <GridRow
                      name={group.name}
                      strong
                      values={months.map((month) => groupSpentIn(group, [month]))}
                      months={months}
                      picked={(month) => isPicked(groupKey, month)}
                      onPick={(month) => pick(groupKey, month)}
                    />
                    {group.categories.map((category) => (
                      <GridRow
                        key={category.key}
                        name={category.name}
                        values={months.map((month) => spentIn(category, [month]))}
                        budgets={months.map((month) => category.budgetByMonth.get(month))}
                        months={months}
                        picked={(month) => isPicked(category.key, month)}
                        onPick={(month) => pick(category.key, month)}
                      />
                    ))}
                  </tbody>
                );
              })}
              <tfoot>
                <GridRow
                  name="Total"
                  strong
                  values={months.map((month) => totalSpentIn(data, [month]))}
                  months={months}
                  picked={(month) => isPicked(ALL, month)}
                  onPick={(month) => pick(ALL, month)}
                />
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-caption text-muted-foreground">
          Tap a figure to see what is behind it. Bars compare a row’s months.
        </p>
      </PageShell.Main>

      <PageShell.Side className="space-y-6 pb-16">
        {cell ? (
          <CellDetail cell={cell} data={data} onClose={() => setSearch({ cell: undefined })} />
        ) : (
          <Overview data={data} months={months} currentMonth={currentMonth} onPick={pick} />
        )}
      </PageShell.Side>
    </PageShell>
  );
}

function GridRow({
  name,
  values,
  budgets,
  months,
  strong = false,
  picked,
  onPick,
}: {
  name: string;
  values: Cents[];
  budgets?: (Cents | undefined)[];
  months: string[];
  strong?: boolean;
  picked: (month: string) => boolean;
  onPick: (month: string) => void;
}) {
  const max = Math.max(1, ...values);
  const shown = values.filter((value) => value !== 0);
  const average = shown.length > 0 ? divideCents(sumCents(values), shown.length) : ZERO_CENTS;
  return (
    <tr className={cn(strong && "bg-muted/50")}>
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-10 max-w-36 truncate p-2 text-left text-body",
          strong ? "bg-muted font-semibold" : "bg-background pl-4 font-normal"
        )}
      >
        {name}
      </th>
      {months.map((month, index) => {
        const cents = values[index] ?? ZERO_CENTS;
        const budget = budgets?.[index];
        const over = budget !== undefined && cents > budget;
        const isPicked = picked(month);
        return (
          <td key={month} className="p-0.5">
            {cents === 0 ? (
              <span className="block px-2 py-1 text-right text-caption text-muted-foreground">
                –
              </span>
            ) : (
              <button
                type="button"
                aria-pressed={isPicked}
                aria-label={`${name}, ${monthLabel(month)}: ${spokenMoney({ kind: "balance", cents })}${over ? ", over budget" : ""}`}
                onClick={() => onPick(month)}
                className={cn(
                  "block w-full min-w-16 space-y-1 rounded-sm px-2 py-1 text-right outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  isPicked && "ring-2 ring-primary"
                )}
              >
                <span
                  className={cn(
                    "block text-caption tabular-nums",
                    strong && "font-semibold",
                    over && "text-shortfall"
                  )}
                >
                  {formatPHPAxisTick(cents)}
                </span>
                <span aria-hidden="true" className="flex h-1 justify-end">
                  <span
                    className={cn(
                      "block rounded-sm",
                      isPicked ? "bg-primary" : over ? "bg-shortfall" : "bg-chart"
                    )}
                    style={{ width: `${(Math.max(0, cents) / max) * 100}%` }}
                  />
                </span>
                {over && <span className="block text-caption text-shortfall">over</span>}
              </button>
            )}
          </td>
        );
      })}
      <td className="hidden p-2 text-right text-caption text-muted-foreground tabular-nums @[600px]:table-cell">
        {formatPHPAxisTick(average)}
      </td>
    </tr>
  );
}

function describeCell(cell: Cell, data: ReportData) {
  if (cell.key === ALL) {
    return {
      title: `All spending, ${monthLabel(cell.month)}`,
      keys: allCategories(data).map((category) => category.key),
      link: { to: "/transactions", search: { month: cell.month, type: "expense" } } as const,
    };
  }
  if (cell.key.startsWith(GROUP_PREFIX)) {
    const group = data.groups.find((candidate) => `${GROUP_PREFIX}${candidate.id}` === cell.key);
    return {
      title: `${group?.name ?? "Group"}, ${monthLabel(cell.month)}`,
      keys: group?.categories.map((category) => category.key) ?? [],
      link: null,
    };
  }
  const category = findCategory(data, cell.key);
  return {
    title: `${category?.name ?? "Category"}, ${monthLabel(cell.month)}`,
    keys: [cell.key],
    budget: category?.budgetByMonth.get(cell.month),
    link: { to: "/transactions", search: { month: cell.month, category: cell.key } } as const,
  };
}

function CellDetail({
  cell,
  data,
  onClose,
}: {
  cell: Cell;
  data: ReportData;
  onClose: () => void;
}) {
  const { title, keys, budget, link } = describeCell(cell, data);
  const sum = (month: string) =>
    sumCents(
      allCategories(data)
        .filter((category) => keys.includes(category.key))
        .map((category) => spentIn(category, [month]))
    );
  const spent = sum(cell.month);
  const previous = shiftMonth(cell.month, -1);
  const change = diffCents(spent, sum(previous));
  const lines = linesFor(data, keys, [cell.month]);
  const twoPanes = useTwoPanes();
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!twoPanes) sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [twoPanes, cell.key, cell.month]);

  return (
    <section
      ref={sectionRef}
      aria-label={title}
      className="scroll-mt-16 space-y-4 rounded-md border p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-heading">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <HeroFigure
        label="Spent"
        value={<Money kind="balance" cents={spent} />}
        caption={
          <>
            <Money kind="balance" cents={absCents(change)} /> {change >= 0 ? "more" : "less"} than{" "}
            {monthLabel(previous)}
            {budget !== undefined && (
              <>
                {" "}
                · budget <Money kind="balance" cents={budget} />
              </>
            )}
          </>
        }
      />
      {link ? (
        <Button asChild variant="outline" size="sm">
          <Link {...link}>Open in Transactions</Link>
        </Button>
      ) : (
        <p className="text-caption text-muted-foreground">A group filter in Transactions: #260</p>
      )}
      <ul className="divide-y">
        {lines.slice(0, LINES_SHOWN).map((line) => (
          <li key={line.id}>
            <ListRow
              link={{ to: "/transactions", search: { open: line.id } }}
              label={line.description}
              detail={format(parseLocalDate(line.date), "MMM d")}
              amount={
                <Money
                  kind={line.type === "income" ? "income" : "expense"}
                  cents={line.amountCents}
                />
              }
            />
          </li>
        ))}
      </ul>
      {lines.length > LINES_SHOWN && (
        <p className="text-caption text-muted-foreground">{lines.length - LINES_SHOWN} more</p>
      )}
    </section>
  );
}

function Overview({
  data,
  months,
  currentMonth,
  onPick,
}: {
  data: ReportData;
  months: string[];
  currentMonth: string;
  onPick: (key: string, month: string) => void;
}) {
  const previous = shiftMonth(currentMonth, -1);
  const changes = allCategories(data)
    .map((category) => ({
      category,
      change: diffCents(spentIn(category, [currentMonth]), spentIn(category, [previous])),
    }))
    .filter(({ change }) => change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 5);
  const thin = data.monthsWithSpending.length < 2;

  return (
    <>
      <section className="space-y-3">
        <SectionHeader title="Spending trend" />
        {thin ? (
          <EmptyState>The trend shows once two months have spending.</EmptyState>
        ) : (
          <TrendLine
            label="Total spending per month"
            points={months.map((month) => ({
              month,
              cents: totalSpentIn(data, [month]),
              link: {
                to: "/prototype/reports",
                search: (prev: Record<string, unknown>) => ({ ...prev, cell: `${ALL}@${month}` }),
              },
            }))}
          />
        )}
      </section>
      <section className="space-y-2">
        <SectionHeader title={`Biggest changes since ${monthLabel(previous)}`} level={3} />
        {thin || changes.length === 0 ? (
          <EmptyState>Changes show once two months have spending.</EmptyState>
        ) : (
          <ul className="divide-y">
            {changes.map(({ category, change }) => (
              <li key={category.key}>
                <ListRow
                  onClick={() => onPick(category.key, currentMonth)}
                  label={category.name}
                  detail={category.groupName}
                  amount={
                    <span className={cn(change > 0 ? "text-foreground" : "text-muted-foreground")}>
                      {change > 0 ? "↑ " : "↓ "}
                      <Money kind="balance" cents={absCents(change)} />
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
