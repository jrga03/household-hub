import { useLiveQuery } from "dexie-react-hooks";
import { readFinanceOverview } from "@/lib/finances/overview";
import type { FinanceView } from "@/lib/finances/view";

/** The current month's Finances for Household or Mine; undefined while loading. */
export function useFinanceOverview(view: FinanceView, userId: string, currentMonth: string) {
  return useLiveQuery(
    () => readFinanceOverview(view, userId, currentMonth),
    [view, userId, currentMonth]
  );
}
