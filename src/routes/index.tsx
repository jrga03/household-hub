import { createFileRoute } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountsCard } from "@/components/accounts/AccountsCard";
import { FinancesSection } from "@/components/finances/FinancesSection";
import { JoinRequestsCard } from "@/components/households/JoinRequestsCard";
import { MembersCard } from "@/components/households/MembersCard";
import { OpeningChecklist } from "@/components/opening/OpeningChecklist";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { confirm } from "@/lib/confirm";
import { replaceHouseholdCode } from "@/lib/household-members";
import type { Household } from "@/lib/households";
import { errorMessage } from "@/lib/utils";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/")({
  component: HomePage,
});

interface SectionProps {
  household: Household;
  userId: string;
  isOwner: boolean;
}

/** Home's sections, top to bottom; later non-finance sections join this list. */
const SECTIONS: { id: string; Section: ComponentType<SectionProps> }[] = [
  { id: "opening", Section: OpeningSection },
  { id: "finances", Section: FinancesSection },
  { id: "household", Section: HouseholdSection },
];

function HomePage() {
  const { household, isOwner } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);

  return (
    <div className="bg-background">
      <div className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <h1 className="text-xl font-bold">Home</h1>
        </div>
      </div>

      <PageShell variant="centered">
        <PageShell.Main className="space-y-4">
          {household &&
            userId &&
            SECTIONS.map(({ id, Section }) => (
              <Section key={id} household={household} userId={userId} isOwner={isOwner} />
            ))}
        </PageShell.Main>
      </PageShell>
    </div>
  );
}

function OpeningSection({ household }: SectionProps) {
  return <OpeningChecklist key={household.id} householdId={household.id} />;
}

function HouseholdSection({ household, userId, isOwner }: SectionProps) {
  return (
    <>
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
      <AccountsCard actor={{ householdId: household.id, userId }} />
    </>
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
