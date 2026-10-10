import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useActionState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { createHousehold } from "@/lib/households";
import { signOutWithToast } from "@/lib/sign-out";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/create-or-join")({
  component: CreateOrJoinPage,
});

const HOUSEHOLD_NAME_MAX_LENGTH = 60;

function CreateOrJoinPage() {
  const user = useAuthStore((state) => state.user);
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();

  const [state, createAction] = useActionState(
    async (_previous: { error: string | null }, formData: FormData) => {
      if (!user) return { error: "Sign in again to create a household." };
      const name = String(formData.get("name") ?? "").trim();
      if (!name) return { error: "A household needs a name." };
      try {
        await createHousehold(user.id, name);
        await navigate({ to: "/" });
        return { error: null };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Couldn't create the household.",
        };
      }
    },
    { error: null }
  );

  return (
    <PageShell variant="centered" className="min-h-dvh py-10">
      <PageShell.Main className="mx-auto w-full max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Welcome to Household Hub</h1>
          <p className="text-sm text-muted-foreground">
            Everything you record belongs to a household. Start your own, or join one a member
            shares with you. Alone? A household of one works the same.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create a household</CardTitle>
            <CardDescription>You become its Owner and get a code to share.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="household-name">Household name</Label>
                <Input
                  id="household-name"
                  name="name"
                  required
                  maxLength={HOUSEHOLD_NAME_MAX_LENGTH}
                  placeholder="e.g. Acido home"
                  autoComplete="off"
                />
              </div>

              {state.error && (
                <div
                  role="alert"
                  className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {state.error}
                </div>
              )}

              <SubmitButton
                className="w-full"
                pendingText="Creating..."
                disabled={!isOnline}
                aria-describedby={isOnline ? undefined : "create-offline-hint"}
              >
                Create household
              </SubmitButton>
              {!isOnline && (
                <p id="create-offline-hint" className="text-sm text-muted-foreground">
                  Creating a household needs a connection. You&apos;re offline right now.
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Join a household</CardTitle>
            <CardDescription>
              Ask a member for their Household Code. Joining with a code is coming soon.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="truncate">Signed in as {user?.email}</span>
          <Button variant="ghost" size="sm" onClick={() => void signOutWithToast()}>
            Sign Out
          </Button>
        </div>
      </PageShell.Main>
    </PageShell>
  );
}
