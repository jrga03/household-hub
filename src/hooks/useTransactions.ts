import { useLiveQuery } from "dexie-react-hooks";
import { newestFirst } from "@/lib/transactions/filter";
import { readAccountMoney } from "@/lib/transactions/money";
import { listTransactions } from "@/lib/transactions/projection";
import { listTransfers } from "@/lib/transfers/projection";

async function listRows() {
  const [transactions, transfers] = await Promise.all([listTransactions(), listTransfers()]);
  return newestFirst(transactions, transfers);
}

/** The local transactions and transfers in one list, newest first; undefined while loading. */
export function useTransactionListRows() {
  return useLiveQuery(listRows, []);
}

/** Each account's balance, Cleared and Pending split and envelopes, by account ID. */
export function useAccountMoney() {
  return useLiveQuery(readAccountMoney, []);
}
