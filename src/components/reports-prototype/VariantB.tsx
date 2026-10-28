/**
 * PROTOTYPE (#259) variant B, "Explorer with pane": categories ranked by
 * spending over a period, each with a sparkline. A tap opens the category in
 * the detail pane (a sheet on phones) with its months and its transactions;
 * Transactions is one more tap away.
 */

import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterChip, FilterChips } from "@/components/app/FilterChips";
import { HeroFigure } from "@/components/app/HeroFigure";
import { ListRow } from "@/components/app/ListRow";
import { Money } from "@/components/app/Money";
import { SectionHeader } from "@/components/app/SectionHeader";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { DetailPane, useOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { divideCents, type Cents } from "@/lib/currency";
import { monthLabel, parseLocalDate } from "@/lib/utils/dates";
import { format } from "date-fns";
import { MonthBars, Sparkline } from "./charts";
import {
  findCategory,
  lastMonths,
  linesFor,
  spentIn,
  totalSpentIn,
  type ReportCategory,
  type ReportData,
} from "./data";
import { PERIOD_MONTHS, PERIOD_OPTIONS, VIEW_OPTIONS, type VariantProps } from "./search";

const LINES_SHOWN = 15;

export function VariantB(props: VariantProps) {
  return (
    <PageShell variant="list-detail">
      <Explorer {...props} />
    </PageShell>
  );
}

function periodLabel(months: string[]) {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return "";
  return first === last ? monthLabel(first) : `${monthLabel(first)} to ${monthLabel(last)}`;
}

function changeText(now: Cents, before: Cents) {
  if (before <= 0) return null;
  const percent = Math.round(((now - before) / before) * 100);
  if (percent === 0) return "same as before";
  return `${percent > 0 ? "↑" : "↓"} ${Math.abs(percent)}% vs previous`;
}

function Explorer({ data, view, onViewChange, search, setSearch, currentMonth }: VariantProps) {
  const { openId, open } = useOpenItem();
  const count = PERIOD_MONTHS[search.period];
  const months = lastMonths(currentMonth, count);
  const before = lastMonths(months[0] ?? currentMonth, count + 1).slice(0, count);
  const total = totalSpentIn(data, months);
  const shownGroups = data.groups.filter((group) => !search.group || group.id === search.group);
  const rows = shownGroups
    .flatMap((group) => group.categories)
    .map((category) => ({ category, cents: spentIn(category, months) }))
    .filter(({ cents }) => cents !== 0)
    .sort((a, b) => b.cents - a.cents);
  const thin = data.monthsWithSpending.length < 2;
  const fullBefore = before.every((month) => data.monthsWithSpending.includes(month));
  const sparkMonths = lastMonths(currentMonth, 12).filter(
    (month) => month >= (data.monthsWithSpending[0] ?? currentMonth)
  );
  const openCategory = openId === null ? undefined : (findCategory(data, openId) ?? null);

  return (
    <>
      <PageShell.List className="space-y-6 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            label="Period"
            options={PERIOD_OPTIONS}
            value={search.period}
            onChange={(period) => setSearch({ period })}
          />
          <SegmentedControl
            label="Show reports for"
            options={VIEW_OPTIONS}
            value={view}
            onChange={onViewChange}
          />
        </div>

        <HeroFigure
          label={`Spent, ${periodLabel(months)}`}
          value={<Money kind="balance" cents={total} />}
          caption={
            count > 1 ? (
              <>
                <Money kind="balance" cents={divideCents(total, count)} /> a month on average
              </>
            ) : undefined
          }
        />
        {thin && count > 1 && (
          <p className="text-body text-muted-foreground">
            Only {monthLabel(data.monthsWithSpending[0] ?? currentMonth)} has spending so far, so
            the trends fill in from next month.
          </p>
        )}

        <section className="space-y-3">
          <SectionHeader title="Categories" />
          <FilterChips label="Group">
            <FilterChip
              pressed={!search.group}
              onPressedChange={() => setSearch({ group: undefined })}
            >
              All groups
            </FilterChip>
            {data.groups.map((group) => (
              <FilterChip
                key={group.id}
                pressed={search.group === group.id}
                onPressedChange={(pressed) => setSearch({ group: pressed ? group.id : undefined })}
              >
                {group.name}
              </FilterChip>
            ))}
          </FilterChips>
          {rows.length === 0 ? (
            <EmptyState>No spending in {periodLabel(months)}.</EmptyState>
          ) : (
            <ul className="divide-y">
              {rows.map(({ category, cents }) => (
                <li key={category.key}>
                  <ListRow
                    onClick={() => open(category.key)}
                    open={openId === category.key}
                    label={category.name}
                    detail={
                      <>
                        {category.groupName}
                        {fullBefore &&
                          changeText(cents, spentIn(category, before)) &&
                          ` · ${changeText(cents, spentIn(category, before))}`}
                      </>
                    }
                    amount={<Money kind="balance" cents={cents} />}
                    trailing={
                      sparkMonths.length > 1 ? (
                        <Sparkline
                          values={sparkMonths.map((month) => spentIn(category, [month]))}
                          className="hidden @[480px]:block"
                        />
                      ) : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageShell.List>

      <DetailPane
        title={openCategory?.name}
        description={openCategory?.groupName}
        item={openCategory}
      >
        {(category) => (
          <CategoryDetail
            category={category}
            data={data}
            months={months}
            currentMonth={currentMonth}
          />
        )}
      </DetailPane>
    </>
  );
}

function CategoryDetail({
  category,
  data,
  months,
  currentMonth,
}: {
  category: ReportCategory;
  data: ReportData;
  months: string[];
  currentMonth: string;
}) {
  const total = spentIn(category, months);
  const budget = category.budgetByMonth.get(currentMonth);
  const lines = linesFor(data, [category.key], months);
  const single = months.length === 1 ? months[0] : undefined;
  const history = lastMonths(currentMonth, 12).filter(
    (month) => month >= (data.monthsWithSpending[0] ?? currentMonth)
  );

  return (
    <div className="space-y-6">
      <HeroFigure
        label={`Spent, ${periodLabel(months)}`}
        value={<Money kind="balance" cents={total} />}
        caption={
          budget !== undefined ? (
            <>
              Budget this month <Money kind="balance" cents={budget} />
            </>
          ) : (
            "No budget this month"
          )
        }
      />
      {history.length > 1 ? (
        <MonthBars
          label={`${category.name} per month`}
          bars={history.map((month) => ({
            month,
            cents: spentIn(category, [month]),
            main: months.includes(month),
            link: { to: "/transactions", search: { month, category: category.key } },
          }))}
        />
      ) : (
        <EmptyState>Its months show here once a second month has spending.</EmptyState>
      )}
      <section className="space-y-2">
        <SectionHeader
          level={3}
          title="Transactions"
          action={
            single ? (
              <Link
                to="/transactions"
                search={{ month: single, category: category.key }}
                className="text-body font-medium text-primary underline-offset-4 hover:underline"
              >
                Open in Transactions
              </Link>
            ) : (
              <span className="text-caption text-muted-foreground">Range filter: #260</span>
            )
          }
        />
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
          <p className="text-caption text-muted-foreground">
            {lines.length - LINES_SHOWN} more in this period
          </p>
        )}
      </section>
    </div>
  );
}
