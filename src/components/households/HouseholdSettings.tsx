import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { confirm } from "@/lib/confirm";
import { replaceHouseholdCode } from "@/lib/household-members";
import type { Household } from "@/lib/households";
import { errorMessage } from "@/lib/utils";
import { JoinRequestsCard } from "./JoinRequestsCard";
import { MembersCard } from "./MembersCard";

interface HouseholdSettingsProps {
  household: Household;
  userId: string;
  isOwner: boolean;
}

/** Settings → Household: the household and its code, join requests, and members. */
export function HouseholdSettings({ household, userId, isOwner }: HouseholdSettingsProps) {
  return (
    <section id="household" aria-label="Household" className="scroll-mt-4 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{household.name}</CardTitle>
            <Badge variant="secondary">{isOwner ? "Owner" : "Member"}</Badge>
          </div>
        </CardHeader>
        {isOwner && (
          <HouseholdCode userId={userId} householdId={household.id} code={household.code} />
        )}
      </Card>
      {isOwner && <JoinRequestsCard householdId={household.id} />}
      <MembersCard householdId={household.id} userId={userId} isOwner={isOwner} />
    </section>
  );
}

interface HouseholdCodeProps {
  userId: string;
  householdId: string;
  code: string;
}

function HouseholdCode({ userId, householdId, code }: HouseholdCodeProps) {
  const isOnline = useOnlineStatus();
  const [isReplacing, setIsReplacing] = useState(false);

  async function replaceCode() {
    const confirmed = await confirm({
      title: "Replace the Household Code?",
      description:
        "The current code stops working at once. Requests already sent with it still reach you.",
      confirmLabel: "Replace code",
    });
    if (!confirmed) return;
    setIsReplacing(true);
    try {
      await replaceHouseholdCode(userId, householdId);
      toast.success("Household Code replaced");
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't replace the code."));
    } finally {
      setIsReplacing(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Household Code copied");
    } catch {
      toast.error("Couldn't copy. Read the code out instead.");
    }
  }

  return (
    <CardContent className="space-y-2">
      <p className="text-sm font-medium">Household Code</p>
      <div className="flex items-center gap-3">
        <span
          data-testid="household-code"
          className="font-mono text-2xl font-semibold tracking-[0.3em]"
        >
          {code}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Copy Household Code"
          onClick={() => void copyCode()}
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!isOnline || isReplacing}
          onClick={() => void replaceCode()}
        >
          Replace code
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Share it so others can ask to join. You approve each request; the code alone grants no
        access.
      </p>
    </CardContent>
  );
}
