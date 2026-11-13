import { useLiveQuery } from "dexie-react-hooks";
import { readCategoryLedger, readLedgerRecord, type LedgerRecordId } from "@/lib/budgets/ledger";
import {
  readDistributeLines,
  readPaydayChoices,
  type DistributeMode,
} from "@/lib/budgets/distribute";
import { readMonthView } from "@/lib/budgets/month";
import { listBudgets } from "@/lib/budgets/projection";
import { readPaydays } from "@/lib/paydays/projection";

/** Every budget version on this device; undefined while loading. */
export function useBudgets() {
  return useLiveQuery(listBudgets, []);
}

/** The household's paydays in order; undefined while loading. */
export function usePaydays() {
  return useLiveQuery(readPaydays, []);
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
 * The lines Distribute money opens with; undefined while loading. A changed
 * source, month, mode or payday choice reads as loading: useLiveQuery keeps the previous
 * result until the new read resolves, and those lines belong to the old source.
 */
export function useDistributeLines(
  sourceAccountId: string,
  month: string,
  mode: DistributeMode,
  paydayIds: string[]
) {
  const key = `${sourceAccountId}:${month}:${mode}:${paydayIds.join()}`;
  const read = useLiveQuery(
    async () => ({
      key,
      lines: await readDistributeLines(sourceAccountId, month, mode, paydayIds),
    }),
    // paydayIds is a new array each render; the key holds its value.
    [key]
  );
  return read?.key === key ? read.lines : undefined;
}

/** The paydays Distribute offers for the month; undefined while loading. */
export function usePaydayChoices(sourceAccountId: string, month: string) {
  const key = `${sourceAccountId}:${month}`;
  const read = useLiveQuery(
    async () => ({ key, choices: await readPaydayChoices(sourceAccountId, month) }),
    [sourceAccountId, month]
  );
  return read?.key === key ? read.choices : undefined;
}
