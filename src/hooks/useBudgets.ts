import { useLiveQuery } from "dexie-react-hooks";
import { readMonthView } from "@/lib/budgets/month";

/** Each category's budget, spent, allocated and money for the month; undefined while loading. */
export function useMonthView(month: string, currentMonth: string) {
  return useLiveQuery(() => readMonthView(month, currentMonth), [month, currentMonth]);
}
