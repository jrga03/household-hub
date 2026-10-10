import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  acceptJoinRequest,
  declineJoinRequest,
  pendingJoinRequestsQueryOptions,
  type PendingJoinRequest,
} from "@/lib/join-requests";

const NEW_REQUEST_POLL_MS = 30_000;

/** For the Owner only; RLS shows other Members no requests. */
export function JoinRequestsCard({ householdId }: { householdId: string }) {
  const { data: requests, isError } = useQuery({
    ...pendingJoinRequestsQueryOptions(householdId),
    refetchInterval: NEW_REQUEST_POLL_MS,
  });

  return (
    <Card role="region" aria-labelledby="join-requests-title">
      <CardHeader>
        <CardTitle id="join-requests-title">Join requests</CardTitle>
        <CardDescription>
          People who used your Household Code. Accepting makes them a Member.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isError && !requests && (
          <p className="text-sm text-muted-foreground">
            Join requests show when you&apos;re online.
          </p>
        )}
        {requests?.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending requests.</p>
        )}
        {requests && requests.length > 0 && (
          <ul className="divide-y rounded-md border">
            {requests.map((request) => (
              <JoinRequestRow key={request.id} householdId={householdId} request={request} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface JoinRequestRowProps {
  householdId: string;
  request: PendingJoinRequest;
}

function JoinRequestRow({ householdId, request }: JoinRequestRowProps) {
  const isOnline = useOnlineStatus();
  const [isAnswering, setIsAnswering] = useState(false);

  async function answer(respond: typeof acceptJoinRequest, confirmation: string) {
    setIsAnswering(true);
    try {
      await respond(householdId, request.id);
      toast.success(confirmation);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't answer the request.");
    } finally {
      setIsAnswering(false);
    }
  }

  const disabled = !isOnline || isAnswering;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
      <span className="min-w-0 truncate font-medium">{request.requesterEmail}</span>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => void answer(declineJoinRequest, "Request declined")}
        >
          Decline
        </Button>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => void answer(acceptJoinRequest, `${request.requesterEmail} joined`)}
        >
          Accept
        </Button>
      </div>
    </li>
  );
}
