import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { listAccounts, listRetiredAccounts, readAccountNames } from "@/lib/accounts/projection";

/** The local accounts projection; updates on local writes and on synced events. Undefined while loading. */
export function useAccounts() {
  return useLiveQuery(listAccounts, []);
}

export function useRetiredAccounts() {
  return useLiveQuery(listRetiredAccounts, []);
}

/**
 * Every account on this device: in use first, then retired, each by name; and
 * the same accounts by ID. Undefined while loading.
 */
export function useAllAccounts() {
  const accounts = useAccounts();
  const retired = useRetiredAccounts();
  return useMemo(() => {
    if (!accounts || !retired) return undefined;
    const list = [...accounts, ...retired];
    return { list, byId: new Map(list.map((account) => [account.id, account])) };
  }, [accounts, retired]);
}

export function useAccountNames() {
  return useLiveQuery(readAccountNames, []);
}
