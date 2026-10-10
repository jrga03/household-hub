import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { membershipError } from "@/lib/households";

// Every call needs a connection: Join Requests are server-authoritative, like membership.
const CONNECTION_HINT = "Check your connection and try again.";

export interface MyJoinRequest {
  id: string;
  status: "pending" | "declined";
}

export interface PendingJoinRequest {
  id: string;
  requesterEmail: string;
}

const isJoinRequestStatus = (status: string): status is MyJoinRequest["status"] =>
  status === "pending" || status === "declined";

async function fetchMyJoinRequest(): Promise<MyJoinRequest | null> {
  const { data, error } = await supabase.rpc("my_join_request");
  if (error) throw error;
  const [request] = data;
  if (!request || !isJoinRequestStatus(request.status)) return null;
  return { id: request.id, status: request.status };
}

export const myJoinRequestQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ["my-join-request", userId],
    queryFn: fetchMyJoinRequest,
  });

async function fetchPendingJoinRequests(): Promise<PendingJoinRequest[]> {
  const { data, error } = await supabase
    .from("join_requests")
    .select("id, requester_email, created_at")
    .order("created_at");
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    requesterEmail: row.requester_email,
  }));
}

/** RLS shows these to the Owner only. */
export const pendingJoinRequestsQueryOptions = (householdId: string) =>
  queryOptions({
    queryKey: ["pending-join-requests", householdId],
    queryFn: fetchPendingJoinRequests,
  });

async function callAndRefresh(
  call: PromiseLike<{ error: { code?: string; message: string } | null }>,
  failureMessage: string,
  queryKey: readonly unknown[]
): Promise<void> {
  const { error } = await call;
  if (error) throw membershipError(error, `${failureMessage} ${CONNECTION_HINT}`);
  await queryClient.invalidateQueries({ queryKey });
}

export function requestToJoin(userId: string, householdCode: string): Promise<void> {
  return callAndRefresh(
    supabase.rpc("request_to_join", { household_code: householdCode }),
    "Couldn't send the request.",
    myJoinRequestQueryOptions(userId).queryKey
  );
}

export function cancelJoinRequest(userId: string, requestId: string): Promise<void> {
  return callAndRefresh(
    supabase.rpc("cancel_join_request", { request_id: requestId }),
    "Couldn't cancel the request.",
    myJoinRequestQueryOptions(userId).queryKey
  );
}

export function dismissDeclinedJoinRequest(userId: string, requestId: string): Promise<void> {
  return callAndRefresh(
    supabase.rpc("dismiss_join_request", { request_id: requestId }),
    "Couldn't continue.",
    myJoinRequestQueryOptions(userId).queryKey
  );
}

export function acceptJoinRequest(householdId: string, requestId: string): Promise<void> {
  return callAndRefresh(
    supabase.rpc("accept_join_request", { request_id: requestId }),
    "Couldn't accept the request.",
    pendingJoinRequestsQueryOptions(householdId).queryKey
  );
}

export function declineJoinRequest(householdId: string, requestId: string): Promise<void> {
  return callAndRefresh(
    supabase.rpc("decline_join_request", { request_id: requestId }),
    "Couldn't decline the request.",
    pendingJoinRequestsQueryOptions(householdId).queryKey
  );
}
