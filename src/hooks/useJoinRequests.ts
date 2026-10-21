import { useQuery } from "@tanstack/react-query";
import { useHousehold } from "@/hooks/useHousehold";
import { pendingJoinRequestsQueryOptions } from "@/lib/join-requests";

/**
 * The Owner's pending join requests; RLS shows other Members none. They come
 * from the server, so offline this is the last list fetched this session, or
 * nothing after a reload.
 */
export function usePendingJoinRequests({ poll = false }: { poll?: boolean } = {}) {
  const { household, isOwner } = useHousehold();
  return useQuery({
    ...pendingJoinRequestsQueryOptions(household?.id ?? "", { poll }),
    enabled: household !== null && isOwner,
  });
}
