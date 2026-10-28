/**
 * PROTOTYPE (#259): throwaway. Spending per category per month for the
 * Reports prototype, read from the local projections or made up in memory.
 * Spending is net: expenses less income in the category; transfers never count.
 */

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { budgetsInForce } from "@/lib/budgets/inForce";
import { readCategoryList } from "@/lib/categories/projection";
import { diffCents, parsePHP, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import type { Ownership } from "@/lib/events/ownership";
import type { FinanceView } from "@/lib/finances/overview";
import { UNASSIGNED_FILTER } from "@/lib/transactions/filter";
import { monthOfDate, shiftMonth } from "@/lib/utils/dates";

export type DataSource = "demo" | "thin" | "real";

export interface ReportLine {
  id: string;
  date: string;
  description: string;
  type: "income" | "expense";
  amountCents: Cents;
  /** A category id, or UNASSIGNED_FILTER. */
  categoryKey: string;
}

export interface ReportCategory {
  /** A category id, or UNASSIGNED_FILTER: also the Transactions filter value. */
  key: string;
  name: string;
  groupName: string;
  spentByMonth: Map<string, Cents>;
  budgetByMonth: Map<string, Cents>;
}

export interface ReportGroup {
  id: string;
  name: string;
  categories: ReportCategory[];
}

export interface ReportData {
  /** Oldest first, ending at the current month. */
  months: string[];
  /** The months that have any spending, oldest first. */
  monthsWithSpending: string[];
  groups: ReportGroup[];
  lines: ReportLine[];
}

export const HISTORY_MONTHS = 12;

export const lastMonths = (endMonth: string, count: number) =>
  Array.from({ length: count }, (_, index) => shiftMonth(endMonth, index - count + 1));

export const spentIn = (category: ReportCategory, months: readonly string[]): Cents =>
  sumCents(months.map((month) => category.spentByMonth.get(month) ?? ZERO_CENTS));

export const groupSpentIn = (group: ReportGroup, months: readonly string[]): Cents =>
  sumCents(group.categories.map((category) => spentIn(category, months)));

export const totalSpentIn = (data: ReportData, months: readonly string[]): Cents =>
  sumCents(data.groups.map((group) => groupSpentIn(group, months)));

export const allCategories = (data: ReportData) => data.groups.flatMap((group) => group.categories);

export function findCategory(data: ReportData, key: string) {
  return allCategories(data).find((category) => category.key === key);
}

export function linesFor(data: ReportData, keys: readonly string[], months: readonly string[]) {
  return data.lines
    .filter((line) => keys.includes(line.categoryKey) && months.includes(monthOfDate(line.date)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Household, or Personal and the member's own (as on Home). */
const shownIn = (view: FinanceView, userId: string) => (owned: Ownership) =>
  view === "household"
    ? owned.visibility === "household"
    : owned.visibility === "personal" && owned.ownerUserId === userId;

function addSpending(line: ReportLine, byMonth: Map<string, Cents>) {
  const month = monthOfDate(line.date);
  const before = byMonth.get(month) ?? ZERO_CENTS;
  byMonth.set(
    month,
    line.type === "expense"
      ? sumCents([before, line.amountCents])
      : diffCents(before, line.amountCents)
  );
}

function finish(months: string[], groups: ReportGroup[], lines: ReportLine[]): ReportData {
  const withLines = groups
    .map((group) => ({
      ...group,
      categories: group.categories.filter((category) => category.spentByMonth.size > 0),
    }))
    .filter((group) => group.categories.length > 0);
  const monthsWithSpending = months.filter((month) =>
    withLines.some((group) => group.categories.some((category) => category.spentByMonth.has(month)))
  );
  return { months, monthsWithSpending, groups: withLines, lines };
}

async function readRealReport(
  view: FinanceView,
  userId: string,
  currentMonth: string
): Promise<ReportData> {
  const [list, transactions, budgets] = await Promise.all([
    readCategoryList(),
    db.transactions.toArray(),
    db.budgets.toArray(),
  ]);
  const months = lastMonths(currentMonth, HISTORY_MONTHS);
  const isShown = shownIn(view, userId);
  const lines: ReportLine[] = transactions
    .filter(
      (transaction) =>
        !transaction.removed &&
        isShown(transaction) &&
        months.includes(monthOfDate(transaction.date)) &&
        (transaction.categoryId !== null || transaction.type === "expense")
    )
    .map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      description: transaction.description,
      type: transaction.type,
      amountCents: transaction.amountCents,
      categoryKey: transaction.categoryId ?? UNASSIGNED_FILTER,
    }));

  const budgetsByMonth = months.map((month) => [month, budgetsInForce(budgets, month)] as const);
  const toCategory = (key: string, name: string, groupName: string): ReportCategory => {
    const spentByMonth = new Map<string, Cents>();
    for (const line of lines) if (line.categoryKey === key) addSpending(line, spentByMonth);
    const budgetByMonth = new Map<string, Cents>();
    for (const [month, inForce] of budgetsByMonth) {
      const budget = inForce.get(key);
      if (budget) budgetByMonth.set(month, budget.amountCents);
    }
    return { key, name, groupName, spentByMonth, budgetByMonth };
  };

  const groups: ReportGroup[] = list.groups.map((group) => ({
    id: group.id,
    name: group.name,
    categories: group.categories.map((category) =>
      toCategory(category.id, category.name, group.name)
    ),
  }));
  groups.push({
    id: UNASSIGNED_FILTER,
    name: "Unassigned",
    categories: [
      ...list.ungrouped.map((category) => toCategory(category.id, category.name, "Unassigned")),
      toCategory(UNASSIGNED_FILTER, "No category", "Unassigned"),
    ],
  });
  return finish(months, groups, lines);
}

const DEMO_GROUPS: { name: string; categories: [string, number, number?][] }[] = [
  {
    name: "Bills",
    categories: [
      ["Electricity", 4200, 4500],
      ["Water", 650],
      ["Internet", 1699, 1699],
      ["Mobile load", 900],
    ],
  },
  {
    name: "Food",
    categories: [
      ["Groceries", 14000, 15000],
      ["Dining out", 5200, 4000],
      ["Coffee", 1400, 1500],
    ],
  },
  {
    name: "Transport",
    categories: [
      ["Fuel", 4800, 5000],
      ["Grab", 1800],
      ["Parking and tolls", 900],
    ],
  },
  {
    name: "Family",
    categories: [
      ["School", 6500, 6500],
      ["Allowance", 3000, 3000],
      ["Health", 1500, 2000],
    ],
  },
  {
    name: "Wants",
    categories: [
      ["Subscriptions", 1100, 1200],
      ["Shopping", 3500, 3000],
      ["Gifts", 800],
    ],
  },
];

const DESCRIPTIONS: Record<string, string[]> = {
  Groceries: ["SM Supermarket", "Puregold", "Landers", "Palengke"],
  "Dining out": ["Jollibee", "Mang Inasal", "Max's", "Army Navy"],
  Coffee: ["Starbucks", "Tim Hortons", "But First Coffee"],
  Fuel: ["Petron", "Shell", "Caltex"],
  Grab: ["Grab ride", "GrabFood"],
  Shopping: ["Shopee", "Lazada", "Uniqlo"],
};

/** A seeded generator, so the demo looks the same on every reload. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDemoReport(currentMonth: string, today: Date, historyMonths: number): ReportData {
  const random = seeded(259);
  const months = lastMonths(currentMonth, HISTORY_MONTHS);
  const activeMonths = months.slice(-historyMonths);
  const lines: ReportLine[] = [];
  const groups: ReportGroup[] = DEMO_GROUPS.map((group, groupIndex) => ({
    id: `demo-group-${groupIndex}`,
    name: group.name,
    categories: group.categories.map(([name, monthly, budget], categoryIndex) => {
      const key = `demo-${groupIndex}-${categoryIndex}`;
      const spentByMonth = new Map<string, Cents>();
      const budgetByMonth = new Map<string, Cents>();
      for (const month of activeMonths) {
        const isCurrent = month === currentMonth;
        const daysSoFar = isCurrent ? today.getDate() : 28;
        const seasonal = month.endsWith("-12") ? 1.35 : month.endsWith("-06") ? 1.15 : 1;
        const target = monthly * seasonal * (0.75 + random() * 0.5) * (daysSoFar / 28);
        const count = Math.max(1, Math.round(target / Math.max(monthly / 4, 400)));
        const names = DESCRIPTIONS[name] ?? [name];
        for (let index = 0; index < count; index++) {
          const day = Math.min(daysSoFar, 1 + Math.floor(random() * daysSoFar));
          const line: ReportLine = {
            id: `${key}-${month}-${index}`,
            date: `${month}-${String(day).padStart(2, "0")}`,
            description: names[Math.floor(random() * names.length)] ?? name,
            type: "expense",
            amountCents: parsePHP(
              Math.round((target / count) * (0.6 + random() * 0.8) * 100) / 100
            ),
            categoryKey: key,
          };
          lines.push(line);
          addSpending(line, spentByMonth);
        }
        if (name === "Shopping" && random() > 0.6) {
          const refund: ReportLine = {
            id: `${key}-${month}-refund`,
            date: `${month}-${String(Math.min(daysSoFar, 20)).padStart(2, "0")}`,
            description: "Refund",
            type: "income",
            amountCents: parsePHP(Math.round(monthly * 0.3)),
            categoryKey: key,
          };
          lines.push(refund);
          addSpending(refund, spentByMonth);
        }
        if (budget !== undefined) budgetByMonth.set(month, parsePHP(Math.round(budget * 1.15)));
      }
      return { key, name, groupName: group.name, spentByMonth, budgetByMonth };
    }),
  }));
  return finish(months, groups, lines);
}

/** The report for the chosen source; undefined while the real one loads. */
export function useReportData(
  source: DataSource,
  view: FinanceView,
  userId: string,
  currentMonth: string
): ReportData | undefined {
  const real = useLiveQuery(
    () => (source === "real" ? readRealReport(view, userId, currentMonth) : undefined),
    [source, view, userId, currentMonth]
  );
  const demo = useMemo(
    () => makeDemoReport(currentMonth, new Date(), source === "thin" ? 1 : 9),
    [currentMonth, source]
  );
  if (source === "real") return real;
  // Mine shows a smaller made-up household so the switch visibly changes something.
  return view === "household" ? demo : { ...demo, groups: demo.groups.slice(2, 4) };
}
