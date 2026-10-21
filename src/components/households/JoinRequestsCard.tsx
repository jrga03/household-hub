import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Button } from "@/components/app/Button";
import { EmptyState } from "@/components/app/EmptyState";
import { ListRow } from "@/components/app/ListRow";
import { StatusBadge } from "@/components/app/StatusBadge";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  acceptJoinRequest,
  declineJoinRequest,
  pendingJoinRequestsQueryOptions,
  type PendingJoinRequest,
} from "@/lib/join-requests";
import { errorMessage } from "@/lib/utils";

/** Settings → Join requests, for the Owner only; RLS shows other Members no requests. */
export function JoinRequestsList({ householdId }: { householdId: string }) {
  const { data: requests, isError } = useQuery(
    pendingJoinRequestsQueryOptions(householdId, { poll: true })
  );

  if (isError && !requests) {
    return <EmptyState className="py-0">Join requests show when you&apos;re online.</EmptyState>;
  }
  if (requests?.length === 0) {
    return <EmptyState className="py-0">No pending requests.</EmptyState>;
  }
  if (!requests) return null;
  return (
    <ul aria-label="Join requests" className="-mx-4 divide-y border-y">
      {requests.map((request) => (
        <JoinRequestRow key={request.id} householdId={householdId} request={request} />
      ))}
    </ul>
  );
}

interface JoinRequestRowProps {
  householdId: string;
  request: PendingJoinRequest;
}

export function JoinRequestRow({ householdId, request }: JoinRequestRowProps) {
  const isOnline = useOnlineStatus();
  const [isAnswering, setIsAnswering] = useState(false);

  async function answer(respond: typeof acceptJoinRequest, confirmation: string) {
    setIsAnswering(true);
    try {
      await respond(householdId, request.id);
      toast.success(confirmation);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't answer the request."));
    } finally {
      setIsAnswering(false);
    }
  }

  const disabled = !isOnline || isAnswering;

  return (
    <li className="flex flex-wrap items-center">
      <ListRow
        className="min-w-0 grow basis-48"
        label={request.requesterEmail}
        trailing={
          <StatusBadge tone="outline" icon={Info}>
            Pending
          </StatusBadge>
        }
      />
      <div className="flex shrink-0 gap-2 px-4 py-2">
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
