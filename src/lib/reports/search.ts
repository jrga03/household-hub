import type { FinanceView } from "@/lib/finances/view";
import { isLocalMonth } from "@/lib/utils/dates";
import type { Period } from "./period";

/** Reports' URL state, so back restores the view. Each is left out at its default. */
export interface ReportsSearch {
  /** Month when left out. */
  period?: Period;
  /** "yyyy-MM"; this month when left out. */
  end?: string;
  /** The remembered Home choice when left out. */
  view?: FinanceView;
  /** The open category's ID. */
  category?: string;
  /** The group chip narrowing the list; every group when left out. */
  group?: string;
}

const PERIODS: readonly unknown[] = ["month", "3m", "6m", "year"] satisfies Period[];
const VIEWS: readonly unknown[] = ["household", "mine"] satisfies FinanceView[];

const isPeriod = (value: unknown): value is Period => PERIODS.includes(value);
const isId = (value: unknown): value is string => typeof value === "string" && value !== "";
const isView = (value: unknown): value is FinanceView => VIEWS.includes(value);

export const readReportsSearch = (search: Record<string, unknown>): ReportsSearch => ({
  ...(isPeriod(search.period) && { period: search.period }),
  ...(isLocalMonth(search.end) && { end: search.end }),
  ...(isView(search.view) && { view: search.view }),
  ...(isId(search.category) && { category: search.category }),
  ...(isId(search.group) && { group: search.group }),
});
