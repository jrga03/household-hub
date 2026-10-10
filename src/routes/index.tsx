import { createFileRoute } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountsCard } from "@/components/accounts/AccountsCard";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/")({
  component: HomePage,
});

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
          {household && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>{household.name}</CardTitle>
                  <Badge variant="secondary">{isOwner ? "Owner" : "Member"}</Badge>
                </div>
              </CardHeader>
              {isOwner && <HouseholdCode code={household.code} />}
            </Card>
          )}
          {household && userId && <AccountsCard actor={{ householdId: household.id, userId }} />}
        </PageShell.Main>
      </PageShell>
    </div>
  );
}

function HouseholdCode({ code }: { code: string }) {
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
      </div>
      <p className="text-sm text-muted-foreground">
        Share it so others can ask to join. You approve each request; the code alone grants no
        access.
      </p>
    </CardContent>
  );
}
