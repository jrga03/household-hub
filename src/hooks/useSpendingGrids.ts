import { useEffect, useState } from "react";
import type { SpendingGrids } from "@/lib/reports/spending";
import { watchSpending } from "@/lib/reports/watch-spending";
import { parseLocalDate } from "@/lib/utils/dates";

/**
 * Reports' Spending for Household and Mine, kept current: undefined before the
 * first run, null once the worker fails.
 */
export function useSpendingGrids(userId: string, today: string): SpendingGrids | null | undefined {
  const [grids, setGrids] = useState<SpendingGrids | null>();
  const todayDay = parseLocalDate(today).getDate();
  useEffect(
    () => watchSpending({ userId, todayDay }, setGrids, () => setGrids(null)),
    [userId, todayDay]
  );
  return grids;
}
