import { useLiveQuery } from "dexie-react-hooks";
import { usePendingJoinRequests } from "@/hooks/useJoinRequests";
import { countLocalReviewItems, totalReviewItems, type ReviewCounts } from "@/lib/review/count";

/** How many items of each kind wait for review; undefined until this device's counts are read. */
export function useReviewCounts(): ReviewCounts | undefined {
  const local = useLiveQuery(countLocalReviewItems, []);
  const { data: joinRequests } = usePendingJoinRequests();
  return local && { ...local, joinRequests: joinRequests?.length ?? 0 };
}

/** Everything waiting for review, summed over every kind; 0 while loading. Works offline. */
export function useReviewCount() {
  const counts = useReviewCounts();
  return counts ? totalReviewItems(counts) : 0;
}
