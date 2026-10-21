import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { ActionForm } from "@/components/app/ActionForm";
import { Button } from "@/components/app/Button";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { Input } from "@/components/app/Input";
import { SectionHeader } from "@/components/app/SectionHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { SubmitButton } from "@/components/app/SubmitButton";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { householdQueryOptions } from "@/lib/households";
import {
  cancelJoinRequest,
  dismissDeclinedJoinRequest,
  myJoinRequestQueryOptions,
  requestToJoin,
  type MyJoinRequest,
} from "@/lib/join-requests";
import { errorMessage } from "@/lib/utils";

// How often a pending requester checks whether the Owner has answered.
const ANSWER_POLL_MS = 5_000;
// Six characters, with room for a stray space or two when pasted.
const HOUSEHOLD_CODE_INPUT_MAX_LENGTH = 8;

/** The signed-in person's Join Request; sends them home once they are a Member. */
export function useMyJoinRequest(userId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: request, isPending } = useQuery({
    ...myJoinRequestQueryOptions(userId),
    refetchInterval: (query) => (query.state.data?.status === "pending" ? ANSWER_POLL_MS : false),
  });
  const { data: household } = useQuery(householdQueryOptions(userId));

  const wasPending = useRef(false);
  useEffect(() => {
    if (request === undefined) return;
    // Accepting deletes the request as it adds the Member, so a pending request
    // vanishing means: check whether they are in.
    if (wasPending.current && request === null) {
      void queryClient.refetchQueries({ queryKey: householdQueryOptions(userId).queryKey });
    }
    wasPending.current = request?.status === "pending";
  }, [request, queryClient, userId]);

  useEffect(() => {
    if (household) void navigate({ to: "/" });
  }, [household, navigate]);

  return { request: request ?? null, isLoading: isPending };
}

export function JoinForm({ userId }: { userId: string }) {
  const isOnline = useOnlineStatus();
  const [state, joinAction] = useActionState(
    async (_previous: { error: string | null }, formData: FormData) => {
      const code = String(formData.get("code") ?? "").trim();
      if (!code) return { error: "Enter the Household Code a member shared with you." };
      try {
        await requestToJoin(userId, code);
        return { error: null };
      } catch (error) {
        return { error: errorMessage(error, "Couldn't send the request.") };
      }
    },
    { error: null }
  );

  return (
    <div className="space-y-4">
      <p className="text-body text-muted-foreground">
        Ask a member for their Household Code. The Owner approves your request.
      </p>
      <ActionForm action={joinAction} className="space-y-4">
        <Field label="Household Code">
          <Input
            name="code"
            required
            maxLength={HOUSEHOLD_CODE_INPUT_MAX_LENGTH}
            placeholder="e.g. 7KQ2MX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono tracking-widest uppercase"
          />
        </Field>

        <FormError>{state.error}</FormError>

        <SubmitButton
          className="w-full"
          variant="outline"
          pendingText="Sending…"
          disabled={!isOnline}
          aria-describedby={isOnline ? undefined : "join-offline-hint"}
        >
          Send request
        </SubmitButton>
        {!isOnline && (
          <p id="join-offline-hint" className="text-body text-muted-foreground">
            Joining a household needs a connection. You&apos;re offline right now.
          </p>
        )}
      </ActionForm>
    </div>
  );
}

interface RequestProps {
  userId: string;
  request: MyJoinRequest;
}

export function PendingRequest({ userId, request }: RequestProps) {
  return (
    <RequestCard
      title="Request sent"
      status={
        <StatusBadge tone="outline" icon={Info}>
          Pending
        </StatusBadge>
      }
      description="The household's Owner will accept or decline it. You'll go straight in once they accept."
      actionLabel="Cancel request"
      pendingLabel="Cancelling…"
      onAction={() => cancelJoinRequest(userId, request.id)}
    />
  );
}

export function DeclinedRequest({ userId, request }: RequestProps) {
  return (
    <RequestCard
      title="Request not accepted"
      status={<StatusBadge tone="warning">Declined</StatusBadge>}
      description="Your request to join wasn't accepted this time. You can ask again with a code, or start your own household."
      actionLabel="OK"
      pendingLabel="One moment…"
      onAction={() => dismissDeclinedJoinRequest(userId, request.id)}
    />
  );
}

interface RequestCardProps {
  title: string;
  status: ReactNode;
  description: string;
  actionLabel: string;
  pendingLabel: string;
  onAction: () => Promise<void>;
}

function RequestCard({
  title,
  status,
  description,
  actionLabel,
  pendingLabel,
  onAction,
}: RequestCardProps) {
  const isOnline = useOnlineStatus();
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAction() {
    setIsWorking(true);
    setError(null);
    try {
      await onAction();
    } catch (actionError) {
      setError(errorMessage(actionError, "Something went wrong."));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section aria-label={title} className="space-y-4">
      <div className="space-y-1">
        <SectionHeader title={title} action={status} />
        <p className="text-body text-muted-foreground">{description}</p>
      </div>
      <FormError>{error}</FormError>
      <Button
        variant="outline"
        className="w-full"
        disabled={!isOnline || isWorking}
        onClick={() => void runAction()}
      >
        {isWorking ? pendingLabel : actionLabel}
      </Button>
    </section>
  );
}
