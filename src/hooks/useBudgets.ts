import { useLiveQuery } from "dexie-react-hooks";
import { readCategoryLedger, readLedgerRecord, type LedgerRecordId } from "@/lib/budgets/ledger";
import { readDistributeLines, type DistributeMode } from "@/lib/budgets/distribute";
import { readMonthView } from "@/lib/budgets/month";
import { listBudgets } from "@/lib/budgets/projection";

/** Every budget version on this device; undefined while loading. */
export function useBudgets() {
  return useLiveQuery(listBudgets, []);
}

/** Each category's budget, spent, allocated and money for the month; undefined while loading. */
export function useMonthView(month: string, currentMonth: string) {
  return useLiveQuery(() => readMonthView(month, currentMonth), [month, currentMonth]);
}

/** The month's records touching the category with a running balance; undefined while loading. */
export function useCategoryLedger(categoryId: string, month: string) {
  return useLiveQuery(() => readCategoryLedger(categoryId, month), [categoryId, month]);
}

/** The opened ledger record, live; null once removed, undefined while loading or when none is open. */
export function useLedgerRecord(opened: LedgerRecordId | null) {
  return useLiveQuery(
    async () => (opened ? readLedgerRecord(opened) : undefined),
    [opened?.kind, opened?.id]
  );
}

/**
 * The lines Distribute money opens with, tagged with the source and month they
 * were read for; undefined while loading. After the deps change, the previous
 * result stays until the new read resolves, so compare the tags.
 */
export function useDistributeLines(sourceAccountId: string, month: string, mode: DistributeMode) {
  return useLiveQuery(
    async () => ({
      sourceAccountId,
      month,
      lines: await readDistributeLines(sourceAccountId, month, mode),
    }),
    [sourceAccountId, month, mode]
  );
}
