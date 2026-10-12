import { useLiveQuery } from "dexie-react-hooks";
import { readCategoryList } from "@/lib/categories/projection";

/** The local groups and categories; updates on local writes and on synced events. Undefined while loading. */
export function useCategoryList() {
  return useLiveQuery(readCategoryList, []);
}
