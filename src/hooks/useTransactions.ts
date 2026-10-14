import { useLiveQuery } from "dexie-react-hooks";
import { listBalanceCorrections } from "@/lib/corrections/projection";
import { isLocalDate } from "@/lib/transactions/events";
import { newestFirst } from "@/lib/transactions/filter";
import { readAccountMoney, readClearedBalanceAt } from "@/lib/transactions/money";
import { listTransactions } from "@/lib/transactions/projection";
import { listTransfers } from "@/lib/transfers/projection";

async function listRows() {
  const [transactions, transfers, corrections] = await Promise.all([
    listTransactions(),
    listTransfers(),
    listBalanceCorrections(),
  ]);
  return newestFirst(transactions, transfers, corrections);
}

/** The local transactions, transfers and corrections in one list, newest first; undefined while loading. */
export function useTransactionListRows() {
  return useLiveQuery(listRows, []);
}

/** Each account's balance, Cleared and Pending split and envelopes, by account ID. */
export function useAccountMoney() {
  return useLiveQuery(readAccountMoney, []);
}

/** The account's cleared balance at the end of the date; null for a date that isn't one. */
export function useClearedBalanceAt(accountId: string, date: string) {
  return useLiveQuery(
    async () => (isLocalDate(date) ? readClearedBalanceAt(accountId, date) : null),
    [accountId, date]
  );
}
