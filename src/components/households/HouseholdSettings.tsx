import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/app/Button";
import { StatusBadge } from "@/components/app/StatusBadge";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { confirm } from "@/lib/confirm";
import { replaceHouseholdCode } from "@/lib/household-members";
import type { Household } from "@/lib/households";
import { errorMessage } from "@/lib/utils";

interface HouseholdDetailsProps {
  household: Household;
  userId: string;
  isOwner: boolean;
}

/** Settings → Household: its name, your role, and (for the Owner) the Household Code. */
export function HouseholdDetails({ household, userId, isOwner }: HouseholdDetailsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <p className="min-w-0 truncate font-medium">{household.name}</p>
        <StatusBadge tone="neutral">{isOwner ? "Owner" : "Member"}</StatusBadge>
      </div>
      {isOwner && (
        <HouseholdCode userId={userId} householdId={household.id} code={household.code} />
      )}
    </div>
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
    <div className="space-y-2">
      <p className="text-label">Household Code</p>
      <div className="flex flex-wrap items-center gap-3">
        <span data-testid="household-code" className="font-mono text-title tracking-[0.3em]">
          {code}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Copy Household Code"
          onClick={() => void copyCode()}
        >
          <Copy aria-hidden="true" />
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
      <p className="text-body text-muted-foreground">
        Share it so others can ask to join. You approve each request; the code alone grants no
        access.
      </p>
    </div>
  );
}
