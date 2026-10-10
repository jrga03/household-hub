import { appendEvent, isVisibility } from "@/lib/events/log";
import { requestSync } from "@/lib/sync/triggers";
import { ACCOUNT_CREATED, ACCOUNT_ENTITY, checkNewAccount } from "@/lib/accounts/events";
import type { Cents } from "@/lib/currency";

export interface Actor {
  householdId: string;
  userId: string;
}

export interface NewAccountInput {
  name: string;
  type: string;
  startingBalanceCents: Cents;
  /** Household unless the member deliberately chooses Personal; fixed once created. */
  visibility?: string;
}

/** Works offline: the account shows at once and syncs when the device can reach the server. */
export async function createAccount(actor: Actor, input: NewAccountInput): Promise<{ id: string }> {
  const { account, problem } = checkNewAccount({ ...input });
  if (problem !== null) throw new Error(problem);
  const visibility = input.visibility ?? "household";
  if (!isVisibility(visibility)) throw new Error("Choose Household or Personal.");

  const id = crypto.randomUUID();
  await appendEvent({
    householdId: actor.householdId,
    visibility,
    ownerUserId: visibility === "personal" ? actor.userId : null,
    entityType: ACCOUNT_ENTITY,
    entityId: id,
    eventType: ACCOUNT_CREATED,
    eventVersion: 1,
    actorUserId: actor.userId,
    payload: { ...account },
  });
  requestSync();
  return { id };
}
