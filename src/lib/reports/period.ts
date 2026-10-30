import { sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { monthOfDate, shiftMonth } from "@/lib/utils/dates";
import type { SpendingGrid } from "./spending";

export type Period = "month" | "3m" | "6m" | "year";

const PERIOD_LENGTH: Record<Period, number> = { month: 1, "3m": 3, "6m": 6, year: 12 };

/** The first day of data: a previous period starting earlier has no change figure. */
const GO_LIVE = "2026-10-29";

/** The first month of data, where Reports' arrows and bars stop. */
export const FIRST_MONTH = monthOfDate(GO_LIVE);

export interface PeriodMonths {
  /** Oldest first. */
  months: string[];
  /** Whether the last month counts only up to today's day of the month. */
  cutToToday: boolean;
}

/** The `count` months ending on `end`, oldest first, without those before the first month of data. */
export const monthsEnding = (end: string, count: number) =>
  Array.from({ length: count }, (_, index) => shiftMonth(end, index - count + 1)).filter(
    (month) => month >= FIRST_MONTH
  );

/**
 * The period's months, which are also the months with data that the monthly
 * average divides by: the go-live month and a partial current month count.
 */
export const periodMonths = (period: Period, end: string): PeriodMonths => ({
  months: monthsEnding(end, PERIOD_LENGTH[period]),
  cutToToday: false,
});

/**
 * The months of the same length just before the period. When the period ends
 * on this month, it is cut at today's day, so a partial month compares with a
 * partial month. Null when it starts before go-live.
 */
export function previousPeriod(period: Period, end: string, today: string): PeriodMonths | null {
  const length = PERIOD_LENGTH[period];
  const previousEnd = shiftMonth(end, -length);
  if (`${shiftMonth(previousEnd, 1 - length)}-01` < GO_LIVE) return null;
  return {
    months: monthsEnding(previousEnd, length),
    cutToToday: end === monthOfDate(today),
  };
}

/** Each category's Spending over the months, by category ID. */
export function spendingOver(
  grid: SpendingGrid,
  { months, cutToToday }: PeriodMonths
): Map<string, Cents> {
  const totals = new Map<string, Cents>();
  const lastMonth = months.at(-1);
  for (const month of months) {
    for (const [categoryId, cell] of grid.get(month) ?? []) {
      const spent = cutToToday && month === lastMonth ? cell.spentToDay : cell.spent;
      totals.set(categoryId, sumCents([totals.get(categoryId) ?? ZERO_CENTS, spent]));
    }
  }
  return totals;
}
