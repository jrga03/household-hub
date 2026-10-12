import { useLiveQuery } from "dexie-react-hooks";
import { readAccountMoney } from "@/lib/transactions/money";
import { listTransactions } from "@/lib/transactions/projection";

/** The local transactions, newest first; undefined while loading. */
export function useTransactions() {
  return useLiveQuery(listTransactions, []);
}

/** Each account's balance, Cleared and Pending split and envelopes, by account ID. */
export function useAccountMoney() {
  return useLiveQuery(readAccountMoney, []);
}
