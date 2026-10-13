import { useLiveQuery } from "dexie-react-hooks";
import { countReviewItems } from "@/lib/review/count";

/** How many local items wait for review; 0 while loading. Works offline. */
export function useReviewCount(): number {
  return useLiveQuery(countReviewItems, [], 0);
}
