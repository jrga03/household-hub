import { useLiveQuery } from "dexie-react-hooks";
import { listAllocations } from "@/lib/allocations/projection";

/** The local allocations, newest first; undefined while loading. */
export function useAllocations() {
  return useLiveQuery(listAllocations, []);
}
