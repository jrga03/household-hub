import { useActionState, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  DeclinedRequest,
  JoinForm,
  PendingRequest,
  useMyJoinRequest,
} from "@/components/households/JoinHousehold";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { createHousehold } from "@/lib/households";
import type { MyJoinRequest } from "@/lib/join-requests";
import { errorMessage } from "@/lib/utils";

const HOUSEHOLD_NAME_MAX_LENGTH = 60;

type Choice = "create" | "join";

export function CreateOrJoinChoices({ userId }: { userId: string }) {
  const { request, isLoading } = useMyJoinRequest(userId);

  if (isLoading) return null;
  return <ChoiceToggle userId={userId} request={request} />;
}

// An open Join Request holds the toggle on Join until it is answered or cancelled.
function ChoiceToggle({ userId, request }: { userId: string; request: MyJoinRequest | null }) {
  const [choice, setChoice] = useState<Choice>(request ? "join" : "create");
  const activeChoice = request ? "join" : choice;

  return (
    <Tabs
      value={activeChoice}
      onValueChange={(value) => setChoice(value === "join" ? "join" : "create")}
      className="gap-4"
    >
      <TabsList aria-label="Create or join a household" className="h-10 w-full">
        <TabsTrigger value="create" disabled={request !== null}>
          Create
        </TabsTrigger>
        <TabsTrigger value="join">Join</TabsTrigger>
      </TabsList>
      <TabsContent value="create">
        <CreateHouseholdForm userId={userId} />
      </TabsContent>
      <TabsContent value="join">
        <JoinSide userId={userId} request={request} />
      </TabsContent>
    </Tabs>
  );
}

function JoinSide({ userId, request }: { userId: string; request: MyJoinRequest | null }) {
  if (request?.status === "pending") return <PendingRequest userId={userId} request={request} />;
  if (request?.status === "declined") return <DeclinedRequest userId={userId} request={request} />;
  return <JoinForm userId={userId} />;
}

function CreateHouseholdForm({ userId }: { userId: string }) {
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();

  const [state, createAction] = useActionState(
    async (_previous: { error: string | null }, formData: FormData) => {
      const name = String(formData.get("name") ?? "").trim();
      if (!name) return { error: "A household needs a name." };
      try {
        await createHousehold(userId, name);
        await navigate({ to: "/" });
        return { error: null };
      } catch (error) {
        return {
          error: errorMessage(error, "Couldn't create the household."),
        };
      }
    },
    { error: null }
  );

  return (
    <Card>
      <CardHeader>
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

          <FormError>{state.error}</FormError>

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
  );
}
