import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { confirm } from "@/lib/confirm";
import {
  handOverOwnership,
  householdMembersQueryOptions,
  leaveHousehold,
  removeMember,
  type HouseholdMember,
} from "@/lib/household-members";
import { CREATE_OR_JOIN_PATH } from "@/lib/households";
import { errorMessage } from "@/lib/utils";

interface MembersCardProps {
  householdId: string;
  userId: string;
  isOwner: boolean;
}

export function MembersCard({ householdId, userId, isOwner }: MembersCardProps) {
  const isOnline = useOnlineStatus();
  const [isBusy, setIsBusy] = useState(false);
  const { data: members, isError } = useQuery(householdMembersQueryOptions(householdId));
  const disabled = !isOnline || isBusy;

  async function runAction(action: () => Promise<void>, failure: string) {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(errorMessage(error, failure));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card role="region" aria-labelledby="members-title">
      <CardHeader>
        <CardTitle id="members-title">Members</CardTitle>
        <CardDescription>Everyone in the household sees its Household accounts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError && !members && (
          <p className="text-body text-muted-foreground">Members show when you&apos;re online.</p>
        )}
        {members && (
          <ul aria-label="Members" className="divide-y rounded-md border">
            {members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                isYou={member.userId === userId}
                ownerControls={isOwner && member.userId !== userId}
                disabled={disabled}
                onHandOver={() =>
                  void runAction(
                    () => confirmAndHandOver(userId, householdId, member),
                    "Couldn't hand over ownership."
                  )
                }
                onRemove={() =>
                  void runAction(
                    () => confirmAndRemove(userId, householdId, member),
                    "Couldn't remove them."
                  )
                }
              />
            ))}
          </ul>
        )}
        {!isOnline && (
          <p className="text-body text-muted-foreground">
            Membership changes need a connection. You&apos;re offline right now.
          </p>
        )}
        {members && (
          <LeaveHousehold
            userId={userId}
            isOwner={isOwner}
            isLastMember={members.length === 1}
            disabled={disabled}
            onLeave={(leave) => void runAction(leave, "Couldn't leave the household.")}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface MemberRowProps {
  member: HouseholdMember;
  isYou: boolean;
  ownerControls: boolean;
  disabled: boolean;
  onHandOver: () => void;
  onRemove: () => void;
}

function MemberRow({
  member,
  isYou,
  ownerControls,
  disabled,
  onHandOver,
  onRemove,
}: MemberRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">
          {member.email}
          {isYou && <span className="text-muted-foreground"> (you)</span>}
        </span>
        {member.isOwner && <Badge variant="secondary">Owner</Badge>}
      </span>
      {ownerControls && (
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            aria-label={`Make ${member.email} the Owner`}
            onClick={onHandOver}
          >
            Make Owner
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            aria-label={`Remove ${member.email}`}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      )}
    </li>
  );
}

async function confirmAndHandOver(userId: string, householdId: string, member: HouseholdMember) {
  const confirmed = await confirm({
    title: `Make ${member.email} the Owner?`,
    description:
      "They will answer join requests, manage Members and the Household Code. You stay a Member.",
    confirmLabel: "Make Owner",
  });
  if (!confirmed) return;
  await handOverOwnership(userId, householdId, member.userId);
  toast.success(`${member.email} is now the Owner`);
}

async function confirmAndRemove(userId: string, householdId: string, member: HouseholdMember) {
  const confirmed = await confirm({
    title: `Remove ${member.email}?`,
    description:
      "They lose access to Household accounts, and their devices drop them at their next sync. What they recorded stays in the household. Their Personal accounts go with them.",
    confirmLabel: "Remove",
    destructive: true,
  });
  if (!confirmed) return;
  await removeMember(userId, householdId, member.userId);
  toast.success(`${member.email} was removed`);
}

interface LeaveHouseholdProps {
  userId: string;
  isOwner: boolean;
  isLastMember: boolean;
  disabled: boolean;
  onLeave: (leave: () => Promise<void>) => void;
}

function LeaveHousehold({ userId, isOwner, isLastMember, disabled, onLeave }: LeaveHouseholdProps) {
  const navigate = useNavigate();
  const mustHandOver = isOwner && !isLastMember;

  async function leave() {
    const confirmed = await confirm(
      isLastMember
        ? {
            title: "Leave and delete the household?",
            description:
              "You're the last Member, so the household and its Household accounts are deleted for good. Your Personal accounts stay with you.",
            confirmLabel: "Delete household",
            destructive: true,
          }
        : {
            title: "Leave the household?",
            description:
              "Its Household accounts leave this device. What you recorded stays with the household. Your Personal accounts stay with you.",
            confirmLabel: "Leave",
            destructive: true,
          }
    );
    if (!confirmed) return;
    await leaveHousehold(userId);
    toast.success(isLastMember ? "Household deleted" : "You left the household");
    await navigate({ to: CREATE_OR_JOIN_PATH });
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={disabled || mustHandOver}
        aria-describedby={mustHandOver ? "leave-hand-over-hint" : undefined}
        onClick={() => onLeave(leave)}
      >
        Leave household
      </Button>
      {mustHandOver && (
        <p id="leave-hand-over-hint" className="text-body text-muted-foreground">
          Make another Member the Owner before you leave.
        </p>
      )}
    </div>
  );
}
