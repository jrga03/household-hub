import { useState } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterChip, FilterChips } from "@/components/app/FilterChips";
import { HeroFigure } from "@/components/app/HeroFigure";
import { ListRow } from "@/components/app/ListRow";
import { Money } from "@/components/app/Money";
import { SectionHeader } from "@/components/app/SectionHeader";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { MonthPicker } from "@/components/budgets/MonthPicker";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { PageShell } from "@/components/layout/PageShell";
import type { CategoryList, CategoryRow, GroupRow } from "@/lib/categories/projection";
import { divideCents, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { readFinanceView, rememberFinanceView, type FinanceView } from "@/lib/finances/view";
import {
  FIRST_MONTH,
  monthsEnding,
  periodMonths,
  previousPeriod,
  spendingOver,
  type Period,
} from "@/lib/reports/period";
import type { ReportsSearch } from "@/lib/reports/search";
import type { SpendingGrid, SpendingGrids } from "@/lib/reports/spending";
import { monthOfDate, monthRangeLabel } from "@/lib/utils/dates";
import { Sparkline } from "./Sparkline";

const PERIOD_OPTIONS = [
  { value: "month", label: "Month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "year", label: "Year" },
] as const satisfies readonly { value: Period; label: string }[];

const VIEW_OPTIONS = [
  { value: "household", label: "Household" },
  { value: "mine", label: "Mine" },
] as const;

const SPARKLINE_MONTHS = 12;

interface ReportCategory {
  category: CategoryRow;
  group: GroupRow | null;
}

/** Every category on this device, retired ones included, with its group. */
function categoriesById(list: CategoryList): Map<string, ReportCategory> {
  return new Map(
    [
      ...list.groups.flatMap((group) => group.categories.map((category) => ({ category, group }))),
      ...list.ungrouped.map((category) => ({ category, group: null })),
      ...list.retiredCategories.map(({ group, ...category }) => ({ category, group })),
    ].map((entry) => [entry.category.id, entry])
  );
}

const monthsWithSpending = (grid: SpendingGrid) =>
  [...grid.values()].filter((cells) => [...cells.values()].some(({ spent }) => spent !== 0)).length;

/** Clamped to the months Reports can show: from the first month of data to this month. */
const clampMonth = (month: string, currentMonth: string) =>
  month < FIRST_MONTH ? FIRST_MONTH : month > currentMonth ? currentMonth : month;

/**
 * Reports' category list: the period's Spending, and its categories ranked by
 * it. Reads only the worker's grids and the local category list.
 */
export function ReportsView({
  grids,
  categories,
  search,
  today,
  onSearchChange,
}: {
  grids: SpendingGrids;
  categories: CategoryList;
  search: ReportsSearch;
  /** "yyyy-MM-dd". */
  today: string;
  onSearchChange: (patch: ReportsSearch) => void;
}) {
  const [groupId, setGroupId] = useState<string | null>(null);
  const currentMonth = monthOfDate(today);
  const period = search.period ?? "month";
  const end = clampMonth(search.end ?? currentMonth, currentMonth);
  const view = search.view ?? readFinanceView();
  const grid = grids[view];

  const current = periodMonths(period, end);
  const previous = previousPeriod(period, end, today);
  const totals = spendingOver(grid, current);
  const before = previous && spendingOver(grid, previous);
  const total = sumCents(totals.values());
  const thin = monthsWithSpending(grid) < 2;
  const sparkMonths = monthsEnding(end, SPARKLINE_MONTHS);
  const range = monthRangeLabel(current.months[0] ?? end, end);

  const byId = categoriesById(categories);
  const ranked = [...totals]
    .filter(([, cents]) => cents !== 0)
    .flatMap(([id, cents]) => {
      const found = byId.get(id);
      return found ? [{ ...found, cents }] : [];
    })
    .sort((a, b) => b.cents - a.cents);
  const groups = [
    ...new Map(ranked.flatMap(({ group }) => (group ? [[group.id, group] as const] : []))).values(),
  ];
  const shownGroupId = groups.some((group) => group.id === groupId) ? groupId : null;
  const rows = ranked.filter(({ group }) => shownGroupId === null || group?.id === shownGroupId);

  function chooseView(next: FinanceView) {
    rememberFinanceView(next);
    onSearchChange({ view: next });
  }

  return (
    <>
      <HeaderActions>
        <MonthPicker
          month={end}
          min={FIRST_MONTH}
          max={currentMonth}
          onChange={(next) => onSearchChange({ end: next === currentMonth ? undefined : next })}
        />
      </HeaderActions>

      <PageShell.List className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            label="Period"
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(next) => onSearchChange({ period: next === "month" ? undefined : next })}
          />
          <SegmentedControl
            label="Show reports for"
            options={VIEW_OPTIONS}
            value={view}
            onChange={chooseView}
          />
        </div>

        <HeroFigure
          label={`Spending, ${range}`}
          value={<Money kind="balance" cents={total} />}
          caption={
            period !== "month" && (
              <>
                <Money kind="balance" cents={divideCents(total, current.months.length)} /> a month
                on average
              </>
            )
          }
        />

        <section className="space-y-3">
          <SectionHeader title="Categories" />
          {thin && ranked.length > 0 && (
            <p className="text-body text-muted-foreground">
              Trends show once a second month has spending.
            </p>
          )}
          {groups.length > 1 && (
            <FilterChips label="Group">
              {groups.map((group) => (
                <FilterChip
                  key={group.id}
                  pressed={group.id === shownGroupId}
                  onPressedChange={(pressed) => setGroupId(pressed ? group.id : null)}
                >
                  {group.name}
                </FilterChip>
              ))}
            </FilterChips>
          )}
          {rows.length === 0 ? (
            <EmptyState>No spending in {range}.</EmptyState>
          ) : (
            <ul aria-label="Categories" className="divide-y border-y">
              {rows.map(({ category, group, cents }) => (
                <li key={category.id}>
                  <ListRow
                    onClick={() => onSearchChange({ category: category.id })}
                    open={search.category === category.id}
                    className="px-0"
                    label={category.name}
                    detail={
                      <>
                        {group?.name}
                        {before && (
                          <Change now={cents} before={before.get(category.id) ?? ZERO_CENTS} />
                        )}
                      </>
                    }
                    amount={<Money kind="balance" cents={cents} />}
                    trailing={
                      thin || sparkMonths.length < 2 ? undefined : (
                        <Sparkline
                          values={sparkMonths.map(
                            (month) => grid.get(month)?.get(category.id)?.spent ?? ZERO_CENTS
                          )}
                          className="hidden @[480px]:block"
                        />
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageShell.List>
    </>
  );
}

/** The change against the previous period, as a percent; nothing when that period spent nothing. */
function Change({ now, before }: { now: Cents; before: Cents }) {
  if (before <= 0) return null;
  const percent = Math.round(((now - before) / before) * 100);
  const spoken =
    percent === 0
      ? "the same as the previous period"
      : `${percent > 0 ? "up" : "down"} ${Math.abs(percent)}% on the previous period`;
  return (
    <>
      {" · "}
      <span aria-hidden>
        {percent === 0 ? "No change" : `${percent > 0 ? "↑" : "↓"} ${Math.abs(percent)}%`}
      </span>
      <span className="sr-only">{spoken}</span>
    </>
  );
}
