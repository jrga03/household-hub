import { useEffect, useState } from "react";
import type { SpendingGrids } from "@/lib/reports/spending";
import { watchSpending } from "@/lib/reports/watch-spending";
import { parseLocalDate } from "@/lib/utils/dates";

/** Reports' Spending for Household and Mine, kept current; undefined before the first run. */
export function useSpendingGrids(userId: string, today: string): SpendingGrids | undefined {
  const [grids, setGrids] = useState<SpendingGrids>();
  const todayDay = parseLocalDate(today).getDate();
  useEffect(() => watchSpending({ userId, todayDay }, setGrids), [userId, todayDay]);
  return grids;
}
