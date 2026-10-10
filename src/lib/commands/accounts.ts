import { appendEvent } from "@/lib/events/log";
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
}

/** Works offline: the account shows at once and syncs when the device can reach the server. */
export async function createAccount(actor: Actor, input: NewAccountInput): Promise<{ id: string }> {
  const { account, problem } = checkNewAccount({ ...input });
  if (problem !== null) throw new Error(problem);

  const id = crypto.randomUUID();
  await appendEvent({
    householdId: actor.householdId,
    visibility: "household",
    ownerUserId: null,
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
