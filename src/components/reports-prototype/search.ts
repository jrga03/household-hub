/** PROTOTYPE (#259): throwaway. The Reports prototype's URL state and variant props. */

import type { FinanceView } from "@/lib/finances/overview";
import { isLocalMonth } from "@/lib/utils/dates";
import type { DataSource, ReportData } from "./data";

export const VARIANTS = [
  { key: "A", name: "Report page" },
  { key: "B", name: "Explorer with pane" },
  { key: "C", name: "Month grid" },
] as const;

export type VariantKey = (typeof VARIANTS)[number]["key"];

export const PERIODS = ["1m", "3m", "6m", "12m"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_MONTHS: Record<Period, number> = { "1m": 1, "3m": 3, "6m": 6, "12m": 12 };

export interface ReportsSearch {
  variant: VariantKey;
  data: DataSource;
  period: Period;
  /** The month the breakdown shows; the current month when absent. */
  month?: string;
  /** A: the expanded group. */
  group?: string;
  /** B: the open category (DetailPane). */
  open?: string;
  /** C: the picked cell, "<category key>@<month>" or "all@<month>". */
  cell?: string;
}

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.find((option) => option === String(value)) ?? fallback;

const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);

export function readReportsSearch(search: Record<string, unknown>): ReportsSearch {
  return {
    variant: oneOf(
      VARIANTS.map((variant) => variant.key),
      search.variant,
      "A"
    ),
    data: oneOf(["demo", "thin", "real"], search.data, "demo"),
    period: oneOf(PERIODS, search.period, "6m"),
    month: isLocalMonth(search.month) ? search.month : undefined,
    group: text(search.group),
    open: text(search.open),
    cell: text(search.cell),
  };
}

export interface VariantProps {
  data: ReportData;
  view: FinanceView;
  onViewChange: (view: FinanceView) => void;
  search: ReportsSearch;
  setSearch: (change: Partial<ReportsSearch>) => void;
  currentMonth: string;
}

export const VIEW_OPTIONS = [
  { value: "household", label: "Household" },
  { value: "mine", label: "Mine" },
] as const;

export const PERIOD_OPTIONS = [
  { value: "1m", label: "Month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "Year" },
] as const;
