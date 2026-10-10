import { useLiveQuery } from "dexie-react-hooks";
import { listAccounts } from "@/lib/accounts/projection";

/** The local accounts projection; updates on local writes and on synced events. Undefined while loading. */
export function useAccounts() {
  return useLiveQuery(listAccounts, []);
}
