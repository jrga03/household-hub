import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { useHousehold } from "@/hooks/useHousehold";
import { pendingJoinRequestsQueryOptions } from "@/lib/join-requests";
import { countLocalReviewItems, totalReviewItems, type ReviewCounts } from "@/lib/review/count";

/**
 * The Owner's pending join requests; RLS shows other Members none. They come
 * from the server, so offline this is the last list fetched this session, or
 * nothing after a reload.
 */
export function usePendingJoinRequests(options: { refetchInterval?: number } = {}) {
  const { household, isOwner } = useHousehold();
  return useQuery({
    ...pendingJoinRequestsQueryOptions(household?.id ?? ""),
    enabled: household !== null && isOwner,
    ...options,
  });
}

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
