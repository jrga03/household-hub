import { useLiveQuery } from "dexie-react-hooks";
import { readFinanceOverview, type FinanceScope } from "@/lib/finances/overview";

/** The current month's Finances for Household or Mine; undefined while loading. */
export function useFinanceOverview(scope: FinanceScope, userId: string, currentMonth: string) {
  return useLiveQuery(
    () => readFinanceOverview(scope, userId, currentMonth),
    [scope, userId, currentMonth]
  );
}
