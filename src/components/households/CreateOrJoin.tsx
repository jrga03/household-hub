import { useActionState, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  DeclinedRequest,
  JoinForm,
  PendingRequest,
  useMyJoinRequest,
} from "@/components/households/JoinHousehold";
import { ActionForm } from "@/components/app/ActionForm";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { Input } from "@/components/app/Input";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/app/Tabs";
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
    <div className="space-y-4">
      <p className="text-body text-muted-foreground">
        You become its Owner and get a code to share.
      </p>
      <ActionForm action={createAction} className="space-y-4">
        <Field label="Household name">
          <Input
            name="name"
            required
            maxLength={HOUSEHOLD_NAME_MAX_LENGTH}
            placeholder="e.g. Acido home"
            autoComplete="off"
          />
        </Field>

        <FormError>{state.error}</FormError>

        <SubmitButton
          className="w-full"
          pendingText="Creating…"
          disabled={!isOnline}
          aria-describedby={isOnline ? undefined : "create-offline-hint"}
        >
          Create household
        </SubmitButton>
        {!isOnline && (
          <p id="create-offline-hint" className="text-body text-muted-foreground">
            Creating a household needs a connection. You&apos;re offline right now.
          </p>
        )}
      </ActionForm>
    </div>
  );
}
